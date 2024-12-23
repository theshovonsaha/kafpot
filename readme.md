# **Kafka Partition Visualizer**

Kafka Partition Visualizer is a real-time analytics tool for visualizing Kafka message partitioning. The project includes a Python-based FastAPI backend and a minimal frontend using plain JavaScript and HTML to monitor message distribution across Kafka partitions.

---

## **Features**

- Visualize Kafka message distribution across partitions in real time.
- Compare **normal** and **smart** partitioning strategies.
- Start and stop data streams dynamically.
- Monitor metrics like total messages and partition loads.

---

## **Project Structure**

```
.
├── app.py                # FastAPI backend with Kafka producer
├── smart_partitioner.py  # Smart partitioning logic for Kafka
├── load_tracker.py       # Kafka load tracking
├── docker-compose.yml    # Kafka setup with Docker
├── run.sh                # Script to run the project
├── web/
│   ├── index.html        # Frontend entry point
│   └── static/
│       └── app.js        # JavaScript for frontend interactivity
├── venv/                 # Python virtual environment
├── requirements.txt      # Python dependencies
└── README.md             # Project documentation
```

---

## **Getting Started**

### **Prerequisites**

1. **Python 3.8+**
   - Install Python from [python.org](https://www.python.org/downloads/).
2. **Docker**
   - Install Docker from [docker.com](https://www.docker.com/).

---

### **Backend Setup**

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/kafka-visualizer.git
   cd kafka-visualizer
   ```

2. **Set up a virtual environment:**

   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

4. **Start the backend server:**
   ```bash
   ./run.sh
   ```

---

### **Kafka Setup**

1. **Start Kafka using Docker:**

   ```bash
   docker-compose up -d
   ```

2. **Verify Kafka is running:**
   ```bash
   docker ps
   ```

---

### **Frontend Setup**

The frontend is built using plain HTML and JavaScript and does not require any additional setup or dependency installation.

1. **Navigate to the frontend directory:**

   ```bash
   cd web
   ```

2. **Serve the frontend:**
   You can use any simple HTTP server to serve the frontend files. For example:

   ```bash
   python3 -m http.server
   ```

3. **Access the application:**
   Open [http://localhost:8000](http://localhost:8000) in your browser.

---

## **Running the Project**

1. Ensure the backend and Kafka are running:

   ```bash
   ./run.sh
   docker-compose up -d
   ```

2. Serve the frontend files:

   ```bash
   python3 -m http.server
   ```

3. Open [http://localhost:8000](http://localhost:8000) to view the visualization.

---

## **Publishing the Project Online**

### **Option 1: Deploy Using Docker**

1. Create a `Dockerfile` for the backend:

   ```Dockerfile
   FROM python:3.9-slim
   WORKDIR /app
   COPY . .
   RUN pip install -r requirements.txt
   CMD ["python", "app.py"]
   ```

2. Use any static file hosting service (like GitHub Pages or Netlify) to host the frontend. Copy the `web/` directory to the hosting service.

3. Deploy your Docker containers to a cloud service like AWS, Azure, or DigitalOcean.

---

### **Option 2: Use Render or Heroku for Backend**

1. **Backend Deployment:**

   - Use [Render](https://render.com/) or [Heroku](https://heroku.com/) to deploy the FastAPI backend.
   - Ensure `requirements.txt` and `app.py` are uploaded.

2. **Frontend Deployment:**
   - Host the `web/` directory on any static hosting service (e.g., GitHub Pages, Netlify).

---

## **License**

This project is licensed under the MIT License. See the `LICENSE` file for details.
