const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Nadi Backend is running'
    });
});

app.listen(PORT, () => {
    console.log(`Nadi Backend running on http://localhost:${PORT}`);
});