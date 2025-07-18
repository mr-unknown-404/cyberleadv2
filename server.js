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

// app.post('/api/assign-leads-date', async (req, res) => {
//   try {
//     const { ids } = req.body;

//     // Validate input
//     if (!Array.isArray(ids) || ids.length === 0) {
//       return res.status(400).json({ error: 'Invalid or empty ID array' });
//     }

//     // Convert to ObjectId safely
//     const objectIds = [];
//     for (const id of ids) {
//       if (ObjectId.isValid(id)) {
//         objectIds.push(new ObjectId(id));
//       } else {
//         console.warn(`Skipping invalid ObjectId: ${id}`);
//       }
//     }

//     if (objectIds.length === 0) {
//       return res.status(400).json({ error: 'No valid ObjectIds provided' });
//     }

//     const today = new Date(); // ✅ store as real date

//     const result = await leads.updateMany(
//       { _id: { $in: objectIds } },
//       { $set: { Date: today } }
//     );

//     res.json({ updatedCount: result.modifiedCount });
//   } catch (err) {
//     console.error("🔥 Error in /api/assign-leads-date:", err);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });


// Patch a single field (e.g., sent or msgsent)
// app.patch('/api/leads/:id', async (req, res) => {
//   const id = req.params.id;
//   const update = req.body;

//   try {
//     const result = await leads.updateOne(
//       { _id: new ObjectId(id) },
//       { $set: update }
//     );
//     res.json(result);
//   } catch (err) {
//     res.status(500).json({ error: 'Update failed' });
//   }
// });
app.patch('/api/leads/:id', async (req, res) => {
  const id = req.params.id;
  const update = { ...req.body };

  // ✅ Ensure SrNo remains a number
  if (update.SrNo !== undefined) {
    update.SrNo = Number(update.SrNo);
  }

  // ✅ Convert Date string to actual Date object
  if (update.Date && typeof update.Date === 'string') {
    update.Date = new Date(update.Date);
  }

  try {
    const existing = await leads.findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // ✅ Preserve original Date if not present in request
    if (!('Date' in update)) {
      update.Date = existing.Date;
    }

    const result = await leads.updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );

    res.json(result);
  } catch (err) {
    console.error('PATCH Update error:', err);
    res.status(500).json({ error: 'Update failed' });
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
      { SrNo: isNaN(search) ? -1 : parseInt(search) }
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const total = await leads.countDocuments(filters);
  const data = await leads.find(filters).skip(skip).limit(parseInt(limit)).toArray();

  res.json({ total, data });
});


// Update a lead
// app.put('/api/leads/:id', async (req, res) => {
//   const id = req.params.id;
//   const updatedData = { ...req.body };
//   delete updatedData._id;

//   const result = await leads.updateOne(
//     { _id: new ObjectId(id) },
//     { $set: updatedData }
//   );
//   res.json(result);
// });
app.put('/api/leads/:id', async (req, res) => {
  const id = req.params.id;
  const updatedData = { ...req.body };

  // ✅ Ensure SrNo remains a number if present
  if (updatedData.SrNo !== undefined) {
    updatedData.SrNo = Number(updatedData.SrNo);
  }

  try {
    // ✅ Fetch existing document to preserve Date
    const existing = await leads.findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // ✅ Preserve Date if not explicitly updated
  if (!('Date' in updatedData) || !updatedData.Date) {
  const existingDate = existing.Date instanceof Date ? existing.Date : null;
  updatedData.Date = existingDate || new Date();
}


    const result = await leads.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );

    res.json(result);
  } catch (err) {
    console.error('PUT Update error:', err);
    res.status(500).json({ error: 'Update failed' });
  }
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
  res.json({ total, connected, notContacted, researched, drafted, sent });
});

app.post('/api/assign-leads-date', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ID array' });
    }

    const objectIds = [];
    for (const id of ids) {
      if (ObjectId.isValid(id)) {
        objectIds.push(new ObjectId(id));
      } else {
        console.warn(`Skipping invalid ObjectId: ${id}`);
      }
    }

    if (objectIds.length === 0) {
      return res.status(400).json({ error: 'No valid ObjectIds provided' });
    }

    const today = new Date(); // ✅ native Date object

    const result = await leads.updateMany(
      { _id: { $in: objectIds } },
      {
        $set: {
          Date: today,
          isAssigned: true // ✅ New field
        }
      }
    );

    res.json({ updatedCount: result.modifiedCount });
  } catch (err) {
    console.error("🔥 Error in /api/assign-leads-date:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Date filter
app.get('/api/leads-stats-by-date', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'Missing start or end date' });
  }

  try {
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);

    const baseQuery = {
      Date: { $gte: startDate, $lte: endDate },
      Researched: true
    };

    const [sent, connected, pending, total] = await Promise.all([
      leads.countDocuments({ ...baseQuery, sent: true }),
      leads.countDocuments({ ...baseQuery, status: 'connected' }),
      leads.countDocuments({ ...baseQuery, status: 'pending' }),
      leads.countDocuments(baseQuery),
    ]);

    res.json({ sent, connected, pending, total });
  } catch (err) {
    console.error('Date filter error:', err);
    res.status(500).json({ error: 'Failed to fetch filtered stats' });
  }
});



// Get counts (Sent, Connected, Pending) for today's leads using Date range
app.get('/api/todays-leads-counts', async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const baseQuery = {
      Date: { $gte: startOfDay, $lte: endOfDay },
      // "msg_draft.status": true,
      Researched: true
    };

    const [sent, connected, pending] = await Promise.all([
      leads.countDocuments({ ...baseQuery, sent: true }),
      leads.countDocuments({ ...baseQuery, status: 'connected' }),
      leads.countDocuments({ ...baseQuery, status: 'pending'})
    ]);

    res.json({ sent, connected, pending });
  } catch (err) {
    console.error("🔥 Error in /api/todays-leads-counts:", err);
    res.status(500).json({ error: 'Failed to load counts' });
  }
});

app.get('/api/todays-leads', async (req, res) => {
  const page = parseInt(req.query.page || 1);
  const limit = parseInt(req.query.limit || 50);
  const skip = (page - 1) * limit;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const baseFilter = {
    Researched: true,
    isAssigned: { $ne: true },
    // 'msg_draft.status': true,
  };

  // Check if any leads are assigned today
  const todaysAssignedCount = await leads.countDocuments({
    ...baseFilter,
    Date: { $gte: startOfDay, $lte: endOfDay }
  });

  let finalQuery;

  if (todaysAssignedCount > 0) {
    // ✅ Show all leads assigned today
    finalQuery = {
      ...baseFilter,
      Date: { $gte: startOfDay, $lte: endOfDay }
    };
  } else {
    // ✅ Show unassigned leads before assignment begins
    finalQuery = {
      ...baseFilter,
      sent: false,
      $or: [
        { Date: { $exists: false } },
        { Date: null },
        { Date: { $lt: startOfDay } },
        { Date: { $type: 'string' } } // legacy
      ]
    };
  }

  const data = await leads.find(finalQuery)
    .sort({ SrNo: 1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  const total = await leads.countDocuments(finalQuery);
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
