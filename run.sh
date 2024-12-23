#!/bin/bash

echo "Starting Kafka..."
docker-compose up -d

echo "Waiting for Kafka to start..."
sleep 10

echo "Starting Python application..."
source venv/bin/activate
python src/main.py

echo "To stop Kafka, run: docker-compose down"
