const { default: mongoose } = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    itemCode: { type: String, default: null },
    sku: { type: String, default: null },
    description: { type: String, default: null },
    quantity: { type: Number, default: 0 },
    receivedQuantity: { type: Number, default: 0 },
    unitPrice: { type: Number, default: null },
    mrp: { type: Number, default: null },
    taxableValue: { type: Number, default: null },
    cgstRate: { type: Number, default: 0 },
    sgstRate: { type: Number, default: 0 },
    igstRate: { type: Number, default: 0 },
    totalAmount: { type: Number, default: null },
    hsnCode: { type: String, default: null },
  },
  { _id: false },
);

module.exports = itemSchema;
