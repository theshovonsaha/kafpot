import asyncio
import json
from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from kafka import KafkaProducer
import uvicorn
from threading import Thread
from typing import Dict
import random
from smart_partitioner import SmartPartitioner
from load_tracker import LoadTracker

app = FastAPI()
# First define WebSocket endpoints
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)
    try:
        while True:
            message = await websocket.receive_text()
            if message == "start normal":
                Thread(target=lambda: run_test(False)).start()
            elif message == "start smart":
                Thread(target=lambda: run_test(True)).start()
            elif message == "stop":
                global is_running
                is_running = False
    except:
        active_connections.remove(websocket)

# Then mount static files
app.mount("/static", StaticFiles(directory="web/static"), name="static")

# Add a specific route for the root path
@app.get("/")
async def read_index():
    return FileResponse("web/index.html")

# Mount any other static files if needed
app.mount("/web", StaticFiles(directory="web"), name="web")

# Global variables
active_connections: set[WebSocket] = set()
partition_counts: Dict[int, int] = {}
total_messages = 0
is_running = False
producer = None

async def broadcast_metrics():
    if active_connections:
        message = {
            "partitionCounts": partition_counts,
            "totalMessages": total_messages
        }
        await asyncio.gather(
            *[connection.send_text(json.dumps(message)) 
              for connection in active_connections]
        )

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except:
        active_connections.remove(websocket)

def create_kafka_config(use_smart_partitioner: bool = False) -> dict:
    config = {
        'bootstrap_servers': ['localhost:9092'],
        'key_serializer': lambda x: str(x).encode('utf-8'),
        'value_serializer': lambda x: str(x).encode('utf-8'),
        'acks': 1
    }
    if use_smart_partitioner:
        config['partitioner'] = SmartPartitioner()
    return config

def run_test(use_smart_partitioner: bool = False):
    global producer, partition_counts, total_messages, is_running
    
    if is_running:
        print("Test is already running!")
        return

    print(f"Starting test with {'smart' if use_smart_partitioner else 'normal'} partitioner")
    is_running = True
    partition_counts = {}
    total_messages = 0
    
    config = create_kafka_config(use_smart_partitioner)
    producer = KafkaProducer(**config)
    
    try:
        while is_running:
            total_messages += 1
            key = "hot-key" if random.random() < 0.7 else f"key-{total_messages}"
            
            future = producer.send('demo-topic', 
                                 value=f"value-{total_messages}",
                                 key=key)
            
            partition = future.get().partition
            partition_counts[partition] = partition_counts.get(partition, 0) + 1
            
            print(f"Message sent to partition: {partition} with key: {key}")
            asyncio.run(broadcast_metrics())
            
            asyncio.sleep(0.1)  # Slow down message production
            
    except Exception as e:
        print(f"Error in producer: {str(e)}")
    finally:
        is_running = False
        if producer:
            producer.close()

def start_server():
    uvicorn.run(app, host="0.0.0.0", port=8080)

if __name__ == "__main__":
    server_thread = Thread(target=start_server)
    server_thread.start()
    
    print("Visit http://localhost:8080 to see the visualization")
    print("Commands: start normal, start smart, stop, exit")
    
    while True:
        command = input().strip().lower()
        if command == "start normal":
            if not is_running:
                Thread(target=lambda: run_test(False)).start()
            else:
                print("Test is already running. Stop it first.")
        elif command == "start smart":
            if not is_running:
                Thread(target=lambda: run_test(True)).start()
            else:
                print("Test is already running. Stop it first.")
        elif command == "stop":
            if is_running:
                is_running = False
                print("Stopping test...")
            else:
                print("No test is running.")
        elif command == "exit":
            print("Shutting down...")
            is_running = False
            break
        else:
            print("Unknown command. Valid commands: 'start normal', 'start smart', 'stop', 'exit'")
