const express = require("express");
const { matchByPoNumber } = require("../controllers/match.controller.js");

const router = express.Router();
router.get("/:poNumber", matchByPoNumber);

module.exports = { matchRouter: router };
