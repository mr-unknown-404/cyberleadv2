import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 3001;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;
const COLLECTION = process.env.COLLECTION;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

let db, leads, settings;
MongoClient.connect(MONGO_URI)
  .then(client => {
    db = client.db(DB_NAME);
    leads = db.collection(COLLECTION);
    settings = db.collection('generalSettings');
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

  app.post('/api/assign-todays-leads', async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

    // Find 50 random eligible leads
    const eligibleLeads = await leads.aggregate([
      {
        $match: {
          sent: false,
          "msg_draft.status": true
        }
      },
      { $sample: { size: 50 } },
      { $project: { _id: 1 } }
    ]).toArray();

    if (eligibleLeads.length === 0) {
      return res.status(404).json({ message: "No eligible leads to assign." });
    }

    const ids = eligibleLeads.map(doc => doc._id);

    const updateResult = await leads.updateMany(
      { _id: { $in: ids } },
      { $set: { Date: today } }
    );

    res.json({ message: "Leads assigned", updatedCount: updateResult.modifiedCount });
  } catch (err) {
    console.error("Assignment error:", err);
    res.status(500).json({ error: "Internal error assigning leads" });
  }
});


  
// GET leads with pagination, filters, and search
app.get('/api/leads', async (req, res) => {
  const { page = 1, limit = 10, city, status, search } = req.query;

  const filters = {};

  if (city) filters.city = city;
  if (status) filters.status = status;
  if (search) {
    filters.$or = [
      { name: { $regex: search, $options: 'i' } },
      { companyname: { $regex: search, $options: 'i' } },
      { SrNo: isNaN(search) ? -1 : parseInt(search) } // Exact match for SrNo
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const total = await leads.countDocuments(filters);
  const data = await leads.find(filters).skip(skip).limit(parseInt(limit)).toArray();

  res.json({ total, data });
});


// Update a lead
app.put('/api/leads/:id', async (req, res) => {
  const id = req.params.id;
  const updatedData = { ...req.body };
  delete updatedData._id;

  const result = await leads.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedData }
  );
  res.json(result);
});

// Delete a lead
app.delete('/api/leads/:id', async (req, res) => {
  const id = req.params.id;
  const result = await leads.deleteOne({ _id: new ObjectId(id) });
  res.json(result);
});
// Total stats for dashboard
app.get('/api/dashboard-summary', async (req, res) => {
  const total = await leads.countDocuments();
  const connected = await leads.countDocuments({ status: 'connected' });
  const notContacted = await leads.countDocuments({ status: 'not contacted' });
  const drafted = await leads.countDocuments({ "msg_draft.status": true });
  const sent = await leads.countDocuments({ "msgsent": true });
  const researched = await leads.countDocuments({ "Researched": true });
  res.json({ total, connected, notContacted, researched, drafted,sent });
});
// app.get('/api/todays-leads', async (req, res) => {
//   const page = parseInt(req.query.page || 1);
//   const limit = parseInt(req.query.limit || 50);
//   const skip = (page - 1) * limit;

//   const query = {
//     Researched: true,
//     sent: false,
//     'msg_draft.status': true
//   };

//   const data = await leads.find(query)
//     .sort({ SrNo: 1 })
//     .skip(skip)
//     .limit(limit)
//     .toArray();

//   const total = await leads.countDocuments(query);

//   res.json({ data, total });
// });
app.get('/api/todays-leads', async (req, res) => {
  const page = parseInt(req.query.page || 1);
  const limit = parseInt(req.query.limit || 50); // default to 50
  const skip = (page - 1) * limit;

  const query = {
    Researched: true,
    sent: false,
    'msg_draft.status': true
  };

  const data = await leads.find(query)
    .sort({ SrNo: 1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  const total = await leads.countDocuments(query);
  res.json({ data, total });
});



// Today's leads with filters
// app.get('/api/todays-leads', async (req, res) => {
//   const { page = 1, limit = 10 } = req.query;
//   const skip = (parseInt(page) - 1) * parseInt(limit);

//   const today = new Date();
//   today.setHours(0, 0, 0, 0);

//   const query = {
//     Researched: true,
//     'msg_draft.status': true,
//     createdAt: { $gte: today }
//   };

//   const total = await leads.countDocuments(query);
//   const data = await leads.find(query).skip(skip).limit(parseInt(limit)).toArray();
//   res.json({ total, data });
// });

// GET LinkedIn Token
app.get('/api/settings/linkedin-token', async (req, res) => {
  try {
    const doc = await settings.findOne({});
    res.json({ linkedinToken: doc?.linkedinToken || '' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch token' });
  }
});

// POST LinkedIn Token
app.post('/api/settings/linkedin-token', async (req, res) => {
  const { linkedinToken } = req.body;
  if (!linkedinToken) return res.status(400).json({ error: 'Missing token' });

  try {
    const existing = await settings.findOne({});
    if (existing) {
      await settings.updateOne({ _id: existing._id }, { $set: { linkedinToken } });
    } else {
      await settings.insertOne({ linkedinToken });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save token' });
  }
});
