const { default: mongoose } = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    documentType: {
      type: String,
      required: true,
      enum: ["po", "grn", "invoice"],
    },
    poNumber: { type: String, index: true },
    parsedDocId: { type: mongoose.Schema.Types.ObjectId }, // ref to PO/GRN/Invoice
    parsedModel: { type: String }, // 'PO' | 'GRN' | 'Invoice'
    status: {
      type: String,
      enum: ["pending", "parsed", "failed"],
      default: "pending",
    },
    parseError: { type: String, default: null },
  },
  { timestamps: true },
);

const Document = mongoose.model("Document", documentSchema);
module.exports = { Document };
