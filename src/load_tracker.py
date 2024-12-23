from collections import defaultdict
from threading import Lock
from typing import Dict, DefaultDict, Optional
from statistics import mean
import time

class LoadTracker:
    def __init__(self, window_seconds: int = 60, hot_threshold: float = 1.5):
        """
        Initialize LoadTracker with configurable parameters.
        
        Args:
            window_seconds: Time window in seconds to track load
            hot_threshold: Multiplier above mean to consider partition "hot"
        """
        self._loads: DefaultDict[str, Dict[int, list]] = defaultdict(
            lambda: defaultdict(list)
        )
        self._lock = Lock()
        self._window_seconds = window_seconds
        self._hot_threshold = hot_threshold
    
    def _cleanup_old_records(self, topic: str, partition: int) -> None:
        """Remove records older than the window."""
        current_time = time.time()
        cutoff = current_time - self._window_seconds
        self._loads[topic][partition] = [
            (ts, count) for ts, count in self._loads[topic][partition] 
            if ts > cutoff
        ]
    
    def _get_current_load(self, topic: str, partition: int) -> int:
        """Get the total load for a partition within the time window."""
        self._cleanup_old_records(topic, partition)
        return sum(count for _, count in self._loads[topic][partition])
    
    def is_hot_partition(self, topic: str, partition: int) -> bool:
        """
        Check if a partition is "hot" based on its load relative to others.
        
        Args:
            topic: Kafka topic name
            partition: Partition number
            
        Returns:
            bool: True if partition is considered hot
        """
        with self._lock:
            # Get current loads for all partitions
            partition_loads = {
                p: self._get_current_load(topic, p)
                for p in self._loads[topic].keys()
            }
            
            # Record new message
            current_time = time.time()
            self._loads[topic][partition].append((current_time, 1))
            
            if not partition_loads:
                return False
            
            avg_load = mean(partition_loads.values())
            current_load = partition_loads.get(partition, 0)
            
            return current_load > avg_load * self._hot_threshold
    
    def get_least_loaded_partition(self, topic: str, num_partitions: int) -> int:
        """
        Find the partition with the lowest load.
        
        Args:
            topic: Kafka topic name
            num_partitions: Total number of partitions
            
        Returns:
            int: Partition number with lowest load
        """
        with self._lock:
            partition_loads = {
                p: self._get_current_load(topic, p)
                for p in range(num_partitions)
            }
            
            return min(partition_loads.items(), key=lambda x: x[1])[0]
    
    def record_message(self, topic: str, partition: int) -> None:
        """
        Record a new message being sent to a partition.
        
        Args:
            topic: Kafka topic name
            partition: Partition number
        """
        with self._lock:
            current_time = time.time()
            self._loads[topic][partition].append((current_time, 1))
    
    def get_load_stats(self, topic: str) -> Dict[str, float]:
        """
        Get load statistics for a topic.
        
        Args:
            topic: Kafka topic name
            
        Returns:
            Dict with load statistics
        """
        with self._lock:
            partition_loads = {
                p: self._get_current_load(topic, p)
                for p in self._loads[topic].keys()
            }
            
            if not partition_loads:
                return {
                    "mean_load": 0,
                    "max_load": 0,
                    "min_load": 0,
                    "total_messages": 0
                }
                
            return {
                "mean_load": mean(partition_loads.values()),
                "max_load": max(partition_loads.values()),
                "min_load": min(partition_loads.values()),
                "total_messages": sum(partition_loads.values())
            }