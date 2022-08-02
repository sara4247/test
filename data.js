const { Schema, model } = require("mongoose");

module.exports = model("Members Verification", Schema({
  id: { type: String, required: true },
  access_token: { type: String, default: "null" },
  refresh_token: { type: String, default: "null" }
}));