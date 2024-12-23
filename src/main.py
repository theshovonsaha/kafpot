import asyncio
import json
import time
from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from kafka import KafkaProducer
import uvicorn
from threading import Thread, Lock
from typing import Dict, Set
import random
from smart_partitioner import SmartPartitioner
from load_tracker import LoadTracker

app = FastAPI()

# Define all global variables at the module level
active_connections: Set[WebSocket] = set()
partition_counts: Dict[int, int] = {}
total_messages = 0
is_running = False
producer = None
current_lag = 0
message_lock = Lock()

def run_test(use_smart_partitioner: bool = False, loop=None):
    global producer, partition_counts, total_messages, is_running
    
    print(f"Starting test with {'smart' if use_smart_partitioner else 'normal'} partitioner")
    partition_counts = {}
    total_messages = 0
    
    try:
        config = create_kafka_config(use_smart_partitioner)
        producer = KafkaProducer(**config)
        
        # Pre-generate some common keys for reuse
        hot_key = "hot-key".encode('utf-8')
        batch_size = 100
        
        while is_running:
            with message_lock:
                for _ in range(batch_size):
                    if not is_running:  # Check if we should stop
                        break
                        
                    total_messages += 1
                    key = hot_key if random.random() < 0.8 else f"key-{total_messages}".encode('utf-8')
                    value = f"value-{total_messages}".encode('utf-8')
                    
                    future = producer.send('demo-topic', 
                                       value=value,
                                       key=key)
                    
                    partition = future.get().partition
                    partition_counts[partition] = partition_counts.get(partition, 0) + 1
                
                if loop and total_messages % 10 == 0:
                    loop.call_soon_threadsafe(
                        asyncio.run_coroutine_threadsafe, 
                        broadcast_metrics(), 
                        loop
                    )
            
            time.sleep(0.01)
            
    except Exception as e:
        print(f"Error in producer: {str(e)}")
    finally:
        if producer:
            try:
                producer.flush()
                producer.close()
            except:
                pass
            producer = None
def reset_metrics():
    global partition_counts, total_messages, current_lag
    partition_counts = {}
    total_messages = 0
    current_lag = 0
async def run_comparison():
    """Run simple sequential comparison of normal and smart modes"""
    global is_running, active_connections
    
    try:
        # First run normal mode
        print("Starting comparison - Normal mode")
        is_running = True
        Thread(target=lambda: run_test(False)).start()
        await asyncio.sleep(10)  # Run for 10 seconds
        
        # Stop and wait
        print("Normal mode complete, switching to smart mode...")
        is_running = False
        await asyncio.sleep(2)  # Brief pause between tests
        
        # Then run smart mode
        print("Starting comparison - Smart mode")
        is_running = True
        Thread(target=lambda: run_test(True)).start()
        await asyncio.sleep(10)  # Run for 10 seconds
        
        # Stop
        print("Comparison complete!")
        is_running = False
        
    except Exception as e:
        print(f"Error in comparison: {str(e)}")
        is_running = False
        
    print("Comparison run finished.")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global is_running
    await websocket.accept()
    active_connections.add(websocket)
    try:
        loop = asyncio.get_running_loop()
        while True:
            message = await websocket.receive_text()
            if message == "start normal":
                is_running = True
                Thread(target=lambda: run_test(False, loop)).start()
            elif message == "start smart":
                is_running = True
                Thread(target=lambda: run_test(True, loop)).start()
            elif message == "compare":
                await run_comparison()
            elif message == "stop":
                is_running = False
    except:
        active_connections.remove(websocket)

async def broadcast_metrics():
    if active_connections:
        message = {
            "partitionCounts": partition_counts,
            "totalMessages": total_messages,
            "consumerLag": current_lag
        }
        await asyncio.gather(
            *[connection.send_text(json.dumps(message)) 
              for connection in active_connections]
        )

def create_kafka_config(use_smart_partitioner: bool = False) -> dict:
    config = {
        'bootstrap_servers': ['localhost:9092'],
        'key_serializer': lambda x: x if isinstance(x, bytes) else str(x).encode('utf-8'),
        'value_serializer': lambda x: x if isinstance(x, bytes) else str(x).encode('utf-8'),
        'acks': 1,
        'batch_size': 16384,  # Increased batch size
        'linger_ms': 5,      # Added small delay for batching
        'compression_type': 'lz4'  # Added compression
    }
    if use_smart_partitioner:
        config['partitioner'] = SmartPartitioner()
    return config

# Mount static files
app.mount("/static", StaticFiles(directory="web/static"), name="static")

@app.get("/")
async def read_index():
    return FileResponse("web/index.html")

app.mount("/web", StaticFiles(directory="web"), name="web")

def start_server():
    uvicorn.run(app, host="0.0.0.0", port=8080)

if __name__ == "__main__":
    server_thread = Thread(target=start_server)
    server_thread.start()
    
    print("Visit http://localhost:8080 to see the visualization")
    print("Commands: start normal, start smart, compare, stop, exit")
    
    while True:
        command = input().strip().lower()
        if command == "start normal":
            if not is_running:
                is_running = True
                Thread(target=lambda: run_test(False)).start()
            else:
                print("Test is already running. Stop it first.")
        elif command == "start smart":
            if not is_running:
                is_running = True
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
            print("Unknown command. Valid commands: 'start normal', 'start smart', 'compare', 'stop', 'exit'")