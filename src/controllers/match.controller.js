const { GRN } = require("../models/grn.model.js");
const { PO } = require("../models/po.model.js");
const { Invoice } = require("../models/invoice.model.js");

async function matchByPoNumber(req, res, next) {
  try {
    const { poNumber } = req.params;

    const [po, grns, invoices] = await Promise.all([
      PO.findOne({ poNumber }),
      GRN.find({ poNumber }),
      Invoice.find({ poNumber }),
    ]);

    if (!po && grns.length === 0 && invoices.length === 0) {
      return res.status(404).json({
        status: "insufficient_documents",
        reasons: ["no_documents_found"],
      });
    }
    if (!po) {
      return res.status(200).json({
        status: "insufficient_documents",
        reasons: ["po_not_uploaded"],
      });
    }

    const reasons = [];

    // ── duplicate PO guard ──────────────────────────────────────────────
    const poCount = await PO.countDocuments({ poNumber });
    if (poCount > 1) reasons.push("duplicate_po");

    // ── build PO item map keyed by itemCode ─────────────────────────────
    const poItemMap = {};
    for (const item of po.items) {
      if (item.itemCode) poItemMap[item.itemCode] = item;
    }

    // ── GRN vs PO ───────────────────────────────────────────────────────
    const grnQtyMap = {}; // itemCode → total received across all GRNs

    for (const grn of grns) {
      for (const grnItem of grn.items) {
        const key = grnItem.itemCode;
        grnQtyMap[key] =
          (grnQtyMap[key] || 0) + (grnItem.receivedQuantity || 0);

        if (!poItemMap[key]) {
          reasons.push(`item_missing_in_po:${key}:grn:${grn.grnNumber}`);
          continue;
        }

        if (grnQtyMap[key] > poItemMap[key].quantity) {
          reasons.push(`grn_qty_exceeds_po_qty:${key}`);
        }
      }
    }

    // ── Invoice vs PO & GRN ─────────────────────────────────────────────
    const invoiceQtyMap = {}; // itemCode → total invoiced across all invoices

    for (const invoice of invoices) {
      // invoice date must not be after PO date
      if (po.poDate && invoice.invoiceDate) {
        const poDate = new Date(po.poDate.split("-").reverse().join("-"));
        const invDate = new Date(
          invoice.invoiceDate.split("-").reverse().join("-"),
        );
        if (invDate > poDate)
          reasons.push(`invoice_date_after_po_date:${invoice.invoiceNumber}`);
      }

      for (const invItem of invoice.items) {
        const key = invItem.itemCode;
        invoiceQtyMap[key] =
          (invoiceQtyMap[key] || 0) + (invItem.quantity || 0);

        if (!poItemMap[key]) {
          reasons.push(
            `item_missing_in_po:${key}:invoice:${invoice.invoiceNumber}`,
          );
          continue;
        }

        // invoice qty must not exceed PO qty
        if (invoiceQtyMap[key] > poItemMap[key].quantity) {
          reasons.push(`invoice_qty_exceeds_po_qty:${key}`);
        }

        // invoice qty must not exceed total GRN received qty
        const totalGrnQty = grnQtyMap[key] || 0;
        if (grns.length > 0 && invoiceQtyMap[key] > totalGrnQty) {
          reasons.push(`invoice_qty_exceeds_grn_qty:${key}`);
        }
      }
    }

    // ── determine overall status ─────────────────────────────────────────
    let status;
    if (grns.length === 0 || invoices.length === 0) {
      status = "insufficient_documents";
    } else if (reasons.length === 0) {
      status = "matched";
    } else if (
      reasons.some((r) => r.includes("exceeds") || r.includes("after"))
    ) {
      status = "mismatch";
    } else {
      status = "partially_matched";
    }

    res.status(200).json({
      poNumber,
      status,
      reasons,
      documents: {
        po: {
          id: po._id,
          poDate: po.poDate,
          vendorName: po.vendorName,
          itemCount: po.items.length,
        },
        grns: grns.map((g) => ({
          id: g._id,
          grnNumber: g.grnNumber,
          grnDate: g.grnDate,
        })),
        invoices: invoices.map((i) => ({
          id: i._id,
          invoiceNumber: i.invoiceNumber,
          invoiceDate: i.invoiceDate,
          totalAmount: i.totalAmount,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { matchByPoNumber };
