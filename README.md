# Three-Way Match Engine

A backend service that parses PO, GRN, and Invoice PDF documents using an LLM, stores structured data in MongoDB, and performs three-way matching at the item level.

---

## Stack

- **Node.js** + **Express**
- **MongoDB** + **Mongoose**
- **Nvidia NIM API** (LLaMA 3.3 70B) for document parsing
- **pdf-parse** for PDF text extraction
- **multer** for file uploads

---

## Approach

1. User uploads a PDF with a `documentType` (`po`, `grn`, or `invoice`)
2. `pdf-parse` extracts raw text from the PDF buffer
3. The text is sent to the Nvidia LLM with a type-specific prompt that instructs it to return structured JSON
4. The parsed JSON is saved into the appropriate MongoDB collection (`PO`, `GRN`, or `Invoice`)
5. A `Document` record is also saved as a registry entry linking the file to its parsed record
6. Matching is performed on demand via `GET /match/:poNumber` — it queries all three collections and runs validations

---

## Data Model

### Document (registry)

Tracks every uploaded file and its parse status.

```
originalName   String
documentType   "po" | "grn" | "invoice"
poNumber       String         — indexed, set after parsing
parsedDocId    ObjectId       — ref to PO / GRN / Invoice record
parsedModel    String         — "PO" | "GRN" | "INVOICE"
status         "pending" | "parsed" | "failed"
parseError     String
```

### PO

```
poNumber            String (required, indexed)
poDate              String
vendorName          String
vendorAddress       String
vendorGstin         String
buyerGstin          String
expectedDeliveryDate String
totalTaxableValue   Number
totalAmount         Number
items               [ItemSchema]
documentId          ObjectId → Document
```

### GRN

```
grnNumber           String (required, indexed)
poNumber            String (required, indexed)
grnDate             String
inboundNumber       String
invoiceNumber       String
vendorName          String
totalExpectedQty    Number
totalReceivedQty    Number
totalAmount         Number
items               [ItemSchema]
documentId          ObjectId → Document
```

### Invoice

```
invoiceNumber       String (required, indexed)
poNumber            String (required, indexed)
invoiceDate         String
vendorName          String
vendorGstin         String
buyerGstin          String
irnNumber           String
totalTaxableValue   Number
totalCgst / totalSgst Number
totalAmount         Number
items               [ItemSchema]
documentId          ObjectId → Document
```

### Item (embedded schema, no separate collection)

```
itemCode        String   — primary match key
sku             String
description     String
quantity        Number   — PO ordered / Invoice billed
receivedQuantity Number  — GRN received
unitPrice       Number
mrp             Number
taxableValue    Number
cgstRate / sgstRate / igstRate  Number
totalAmount     Number
hsnCode         String
```

---

## Item Matching Key

Items are matched using **`itemCode`** (SKU or item code).

**Why `itemCode`?**

- It is the most stable, system-generated identifier on procurement documents
- `description` fields vary between vendors (abbreviations, different casing)
- `itemCode` / SKU is present in all three document types (PO, GRN, Invoice)
- It maps directly to a warehouse or ERP SKU, making reconciliation deterministic

---

## Parsing Flow

```
PDF Upload
    │
    ▼
pdf-parse extracts raw text
    │
    ▼
LLM prompt (type-specific) → structured JSON
    │
    ├─ Document.create({ status: "pending" })
    │
    ▼
Model.create({ ...parsed, documentId })   ← GRN / PO / Invoice
    │
    ▼
Document.update({ status: "parsed", parsedDocId, poNumber })
```

If the LLM fails, the Document record is marked `status: "failed"` with the error message stored in `parseError`.

---

## Matching Logic

`GET /match/:poNumber` fetches the PO, all GRNs, and all Invoices for that `poNumber` in parallel, then runs these checks:

| Rule                                        | Reason Code                                             |
| ------------------------------------------- | ------------------------------------------------------- |
| More than one PO for same poNumber          | `duplicate_po`                                          |
| GRN item not found in PO                    | `item_missing_in_po:<itemCode>:grn:<grnNumber>`         |
| Total GRN received qty > PO qty             | `grn_qty_exceeds_po_qty:<itemCode>`                     |
| Invoice item not found in PO                | `item_missing_in_po:<itemCode>:invoice:<invoiceNumber>` |
| Total invoiced qty > PO qty                 | `invoice_qty_exceeds_po_qty:<itemCode>`                 |
| Total invoiced qty > total GRN received qty | `invoice_qty_exceeds_grn_qty:<itemCode>`                |
| Invoice date after PO date                  | `invoice_date_after_po_date:<invoiceNumber>`            |

### Match Status

| Status                   | Condition                                              |
| ------------------------ | ------------------------------------------------------ |
| `matched`                | All documents present, zero reasons                    |
| `mismatch`               | Any qty/date violation found                           |
| `partially_matched`      | Minor issues (e.g. missing item) but no qty violations |
| `insufficient_documents` | PO, GRN, or Invoice not yet uploaded                   |

---

## Out-of-Order Upload Handling

Documents are stored independently as they arrive. No document waits for another.

- Each document is saved to its own collection keyed by `poNumber`
- `GET /match/:poNumber` runs a fresh `Promise.all` query at request time — it always reflects the latest state
- If only 2 of 3 document types exist, the endpoint returns `insufficient_documents` with the missing type in `reasons`
- Once all three are uploaded (in any order), matching runs automatically on the next request

---

## API Reference

### POST `/api/v1/documents/upload`

Upload a PDF document.

**Form-data:**
| Field | Type | Description |
|-------|------|-------------|
| `file` | File | PDF only, max 20MB |
| `documentType` | String | `po`, `grn`, or `invoice` |

**Response:**

```json
{
  "message": "Document uploaded and parsed successfully",
  "documentId": "664abc...",
  "data": { "poNumber": "PO-1234", "vendorName": "...", "items": [...] }
}
```

---

### GET `/api/v1/documents/:id`

Fetch a Document registry record by its MongoDB `_id`.

---

### GET `/api/v1/match/:poNumber`

Run or fetch the three-way match result for a PO number.

**Response:**

```json
{
  "poNumber": "PO-1234",
  "status": "mismatch",
  "reasons": [
    "grn_qty_exceeds_po_qty:SKU-001",
    "invoice_date_after_po_date:INV-005"
  ],
  "documents": {
    "po": {
      "id": "...",
      "poDate": "01-01-2024",
      "vendorName": "ABC Corp",
      "itemCount": 3
    },
    "grns": [{ "id": "...", "grnNumber": "GRN-001", "grnDate": "05-01-2024" }],
    "invoices": [
      {
        "id": "...",
        "invoiceNumber": "INV-005",
        "invoiceDate": "15-01-2024",
        "totalAmount": 50000
      }
    ]
  }
}
```

---

## Sample Parsed JSON

### PO

```json
{
  "poNumber": "PO-2024-001",
  "poDate": "01-01-2024",
  "vendorName": "ABC Supplies Pvt Ltd",
  "vendorGstin": "29ABCDE1234F1Z5",
  "totalAmount": 118000,
  "items": [
    {
      "itemCode": "SKU-101",
      "description": "Industrial Widget A",
      "quantity": 100,
      "unitPrice": 1000,
      "taxableValue": 100000,
      "hsnCode": "8483"
    }
  ]
}
```

### GRN

```json
{
  "grnNumber": "GRN-2024-001",
  "poNumber": "PO-2024-001",
  "grnDate": "10-01-2024",
  "vendorName": "ABC Supplies Pvt Ltd",
  "items": [
    {
      "itemCode": "SKU-101",
      "description": "Industrial Widget A",
      "receivedQuantity": 80,
      "expectedQuantity": 100,
      "unitPrice": 1000
    }
  ]
}
```

### Match Result (mismatch)

```json
{
  "poNumber": "PO-2024-001",
  "status": "mismatch",
  "reasons": ["invoice_qty_exceeds_grn_qty:SKU-101"],
  "documents": {
    "po": { "poDate": "01-01-2024", "itemCount": 1 },
    "grns": [{ "grnNumber": "GRN-2024-001" }],
    "invoices": [{ "invoiceNumber": "INV-2024-001", "totalAmount": 118000 }]
  }
}
```

### Match Result (matched)

```json
{
  "poNumber": "PO-2024-002",
  "status": "matched",
  "reasons": [],
  "documents": { ... }
}
```

---

## Running Locally

```bash
# 1. Clone and install
git clone https://github.com/sai4u-dev/three-way-match-engine
cd three-way-match-engine
npm install

# 2. Set environment variables
cp .env.example .env
# Fill in MONGODB_URI and NVIDIA_API_KEY

# 3. Start
node index.js
npm run start
```

**.env.example**

```
MONGODB_URI=mongodb://localhost:27017/three-way-match
NVIDIA_API_KEY=your_nvidia_nim_api_key
PORT=3000
```

---

## Assumptions

- One PO per `poNumber` is the intended state; duplicates are flagged but not blocked
- `itemCode` is always present in all three document types for matching to work
- Dates are stored as strings in `DD-MM-YYYY` format as extracted by the LLM; date comparison converts them to `Date` objects
- Multiple GRNs and Invoices per PO are supported and quantities are summed across all of them before comparison
- The LLM is expected to return valid JSON; a fence-stripping fallback is in place for non-compliant responses

---

## Tradeoffs

| Decision                                         | Tradeoff                                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| On-demand matching (no pre-computed match state) | Simple to implement; re-runs on every request. With high traffic, a stored `MatchResult` collection would be more efficient |
| LLM for parsing                                  | Flexible and handles varied PDF layouts, but adds latency (~2–5s per doc) and LLM costs                                     |
| Storing dates as strings                         | Preserves original document format; requires conversion for comparison logic                                                |
| `itemCode` as match key                          | Reliable when present; if a document omits `itemCode`, that item is treated as unmatched                                    |

---

## What I Would Improve With More Time

- **Persist match results** — store a `MatchResult` document per `poNumber` and update it on each upload, instead of computing on every GET
- **Switch to Gemini API** — as specified in the assignment; Nvidia NIM was used here as an alternative
- **Webhook / event-driven matching** — trigger a match recompute automatically after each upload via an event emitter or message queue
- **Tolerance thresholds** — allow a configurable tolerance (e.g. ±2%) for quantity and price matching
- **Postman collection** — add a complete exported collection with example requests and responses
- **Unit tests** — cover matching logic edge cases (partial GRNs, duplicate invoices, out-of-order uploads)
- **Rate limiting + auth** — add API key middleware and request throttling before any production use
