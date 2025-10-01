const express = require("express");
const { v4: uuid } = require("uuid");
const { ddb, TableName } = require("../db/dynamo");
const { PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

const router = express.Router();

// CREATE
router.post("/", async (req, res) => {
  try {
    const id = uuid();
    const item = { id, createdAt: new Date().toISOString(), ...req.body }; // you can include s3Key, title, etc.
    await ddb.send(new PutCommand({ TableName, Item: item, ConditionExpression: "attribute_not_exists(id)" }));
    res.status(201).json(item);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// READ one
router.get("/:id", async (req, res) => {
  try {
    const { Item } = await ddb.send(new GetCommand({ TableName, Key: { id: req.params.id } }));
    if (!Item) return res.status(404).json({ error: "Not found" });
    res.json(Item);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// LIST all (simple)
router.get("/", async (_req, res) => {
  try {
    const { Items } = await ddb.send(new ScanCommand({ TableName, Limit: 50 }));
    res.json(Items || []);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// UPDATE
router.patch("/:id", async (req, res) => {
  try {
    const updates = Object.entries(req.body);
    if (!updates.length) return res.status(400).json({ error: "No fields" });
    const names = {}, values = {};
    const set = updates.map(([k, v], i) => { names[`#n${i}`]=k; values[`:v${i}`]=v; return `#n${i} = :v${i}`; }).join(", ");
    const out = await ddb.send(new UpdateCommand({
      TableName, Key: { id: req.params.id },
      UpdateExpression: `SET ${set}`,
      ExpressionAttributeNames: names, ExpressionAttributeValues: values,
      ConditionExpression: "attribute_exists(id)", ReturnValues: "ALL_NEW"
    }));
    res.json(out.Attributes);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE
router.delete("/:id", async (req, res) => {
  try {
    await ddb.send(new DeleteCommand({ TableName, Key: { id: req.params.id }, ConditionExpression: "attribute_exists(id)" }));
    res.status(204).end();
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
