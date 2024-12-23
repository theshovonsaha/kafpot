from collections import defaultdict
from threading import Lock
import time

class LoadTracker:
    def __init__(self, window_size=60, threshold=100):
        """
        Initialize the load tracker.
        
        Args:
            window_size (int): Time window in seconds to track load
            threshold (int): Number of messages that indicates a hot partition
        """
        self.window_size = window_size
        self.threshold = threshold
        self.partition_loads = defaultdict(lambda: defaultdict(list))
        self.lock = Lock()
        
    def record_message(self, topic, partition):
        """Record a message being sent to a partition."""
        with self.lock:
            current_time = time.time()
            self.partition_loads[topic][partition].append(current_time)
            # Clean up old entries
            self._cleanup(topic, partition, current_time)
    
    def is_hot_partition(self, topic, partition):
        """Check if a partition is currently hot."""
        with self.lock:
            current_time = time.time()
            self._cleanup(topic, partition, current_time)
            return len(self.partition_loads[topic][partition]) > self.threshold
    
    def get_least_loaded_partition(self, topic, num_partitions):
        """Get the partition with the least load."""
        with self.lock:
            current_time = time.time()
            loads = []
            
            for partition in range(num_partitions):
                self._cleanup(topic, partition, current_time)
                load = len(self.partition_loads[topic][partition])
                loads.append((load, partition))
            
            # Return partition with minimum load
            return min(loads, key=lambda x: x[0])[1]
    
    def _cleanup(self, topic, partition, current_time):
        """Remove messages outside the time window."""
        cutoff_time = current_time - self.window_size
        self.partition_loads[topic][partition] = [
            t for t in self.partition_loads[topic][partition]
            if t > cutoff_time
        ]