require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const twilio = require("twilio");
const app = express();
app.use(express.json());
app.use(cors());

const MONGO_URI ="mongodb+srv://yuvasrib:yuvabk1118@cluster0.ipzth.mongodb.net/Location-track"

//const MONGO_URI = "mongodb://localhost:27017/Location-track";
const JWT_SECRET = "yuva";
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((error) => console.error("Error connecting to MongoDB:", error));


const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  contacts: [
    {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      group: { type: String, required: true },
    },
  ],
  location: { 
    lat: { type: Number },
    lng: { type: Number },
  },
});

const User = mongoose.model("User", userSchema);

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "All fields are required." });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "Email already in use." });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();

    res.status(201).json({ message: "User registered successfully." });
  } catch (error) {
    console.error(" Error registering user:", error);
    res.status(500).json({ message: "Error registering user." });
  }
});


app.post("/api/login", async (req, res) => { 
  try {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ message: "Email and password are required." });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials." });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(400).json({ message: "Invalid credentials." });

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ token, userId: user._id });
  } catch (error) {
    console.error(" Error logging in:", error);
    res.status(500).json({ message: "Error logging in." });
  }
});

app.post("/api/location", async (req, res) => {
  const { userId, location } = req.body;

  if (!userId || !location || !location.lat || !location.lng) {
    return res.status(400).json({ message: "Invalid data" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    user.location = location;
    await user.save();

    res.status(200).json({ message: "Location updated successfully" });
  } catch (error) {
    console.error(" Error saving location:", error);
    res.status(500).json({ message: "Error saving location." });
  }
});

app.get("/api/contacts",  async (req, res) => {
  try {
    const user = await User.findOne();  
    if (!user) return res.status(404).json({ message: "User not found." });

    res.json({ contacts: user.contacts });
  } catch (error) {
    res.status(500).json({ message: "Error fetching contacts." });
  }
});

app.post("/api/contacts",  async (req, res) => {
  try {
    const { name, phone, group } = req.body;
    if (!name || !phone || !group) return res.status(400).json({ message: "All fields are required." });

    const user = await User.findOne();  
    user.contacts.push({ name, phone, group });
    await user.save();

    res.json({ message: "Contact added successfully." });
  } catch (error) {
    res.status(500).json({ message: "Error adding contact." });
  }
});

app.delete("/api/contacts/:id", async (req, res) => {  
  try {
    await User.updateOne({}, { $pull: { contacts: { _id: req.params.id } } });
    res.json({ message: "Contact removed." });
  } catch (error) {
    res.status(500).json({ message: "Error removing contact." });
  }
});

app.post("/api/send-alert", async (req, res) => { 
  try {
    const { group, location } = req.body;
    if (!group || !location) return res.status(400).json({ message: "Group and location are required." });

    const user = await User.findOne();  
    if (!user) return res.status(404).json({ message: "User not found." });

    const contacts = user.contacts.filter((c) => c.group === group);
    if (!contacts.length) return res.status(404).json({ message: "No contacts found in this group." });

    const messages = contacts.map((contact) =>
      client.messages.create({
        body: ` EMERGENCY ALERT! \nLocation: ${location}\nPlease check on ${user.name}.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: contact.phone,
      })
    );

    await Promise.all(messages); 
    res.status(200).json({ message: `Emergency alert sent to ${contacts.length} contacts.` });
  } catch (error) {
    console.error(" Error sending alert:", error);
    res.status(500).json({ message: "Error sending alert.", error: error.message }); 
  }
});

app.get("/", (req, res) => {
  res.send(" Emergency Alert System Backend is running!");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(` Server running on http://localhost:${PORT}`));


