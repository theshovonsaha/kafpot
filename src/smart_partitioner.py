from kafka.partitioner.default import DefaultPartitioner
from collections import defaultdict
from typing import Set, Dict, Tuple, Optional, List
import threading
import time
import mmh3  # MurmurHash3 for faster hashing

class SmartPartitioner(DefaultPartitioner):
    def __init__(self):
        super().__init__()
        # Advanced load tracking with time windows
        self.partition_loads = defaultdict(lambda: defaultdict(int))
        self.hot_partitions: Set[Tuple[str, int]] = set()
        self.partition_cache: Dict[str, int] = {}
        self.cache_timestamps: Dict[str, float] = {}
        self.last_rebalance = time.time()
        
        # Configurable parameters
        self.load_threshold = 1000  # Messages per window
        self.window_size = 5  # seconds
        self.cache_ttl = 10  # seconds
        self.rebalance_interval = 5  # seconds
        self.hot_partition_threshold = 1.5  # 50% above average
        
        # Performance optimizations
        self.cache_size_limit = 10000
        self.load_history_size = 100
        
        # Thread safety
        self._lock = threading.RLock()  # Reentrant lock for nested acquisitions
        
        # Start background maintenance
        self._start_maintenance()
    
    def _start_maintenance(self):
        """Start background thread for maintenance tasks"""
        def maintenance_loop():
            while True:
                try:
                    self._cleanup_old_data()
                    time.sleep(1)  # Run maintenance every second
                except Exception as e:
                    print(f"Maintenance error: {e}")
                    
        thread = threading.Thread(target=maintenance_loop, daemon=True)
        thread.start()
    
    def _cleanup_old_data(self):
        """Clean up old cache entries and load data"""
        current_time = time.time()
        
        with self._lock:
            # Clean old cache entries
            expired_keys = [
                k for k, v in self.cache_timestamps.items()
                if current_time - v > self.cache_ttl
            ]
            for k in expired_keys:
                self.partition_cache.pop(k, None)
                self.cache_timestamps.pop(k, None)
            
            # Enforce cache size limit
            if len(self.partition_cache) > self.cache_size_limit:
                oldest_keys = sorted(
                    self.cache_timestamps.items(),
                    key=lambda x: x[1]
                )[:len(self.partition_cache) - self.cache_size_limit]
                for k, _ in oldest_keys:
                    self.partition_cache.pop(k, None)
                    self.cache_timestamps.pop(k, None)
            
            # Clean old load data and maintain history size
            for topic in list(self.partition_loads.keys()):
                for partition in list(self.partition_loads[topic].keys()):
                    partition_loads = self.partition_loads[topic][partition]
                    if len(partition_loads) > self.load_history_size:
                        self.partition_loads[topic][partition] = partition_loads[-self.load_history_size:]
    
    def _get_partition_load(self, topic: str, partition: int, window_start: float) -> int:
        """Get current load for a partition within the time window"""
        with self._lock:
            # Make a copy of the load data while under lock
            return self.partition_loads[topic][partition]
    
    def _update_hot_partitions(self, topic: str, num_partitions: int, current_time: float):
        """Update hot partitions set based on current loads with advanced detection"""
        if current_time - self.last_rebalance < self.rebalance_interval:
            return

        with self._lock:
            window_start = current_time - self.window_size
            loads = [(p, self._get_partition_load(topic, p, window_start)) 
                    for p in range(num_partitions)]
            
            if not loads:
                return
                
            # Calculate weighted moving average
            total_load = sum(load for _, load in loads)
            if total_load == 0:
                return
                
            avg_load = total_load / len(loads)
            threshold = avg_load * self.hot_partition_threshold
            
            # Calculate standard deviation for adaptive thresholding
            variance = sum((load - avg_load) ** 2 for _, load in loads) / len(loads)
            std_dev = variance ** 0.5
            
            # Update hot partitions using adaptive threshold
            self.hot_partitions = {
                (topic, p) for p, load in loads 
                if load > threshold and load > avg_load + std_dev
            }
            
            self.last_rebalance = current_time
    
    def _get_least_loaded_partition(self, topic: str, available: List[int], current_time: float) -> int:
        """Get least loaded partition with load prediction"""
        window_start = current_time - self.window_size
        loads = [
            (p, self._get_partition_load(topic, p, window_start))
            for p in available
        ]
        
        if not loads:
            return available[0]
        
        # Sort by load and use the least loaded partition
        loads.sort(key=lambda x: x[1])
        return loads[0][0]
    
    def _fast_hash(self, key: str) -> int:
        """Faster hashing using MurmurHash3"""
        return mmh3.hash(key)

    def partition(self, topic: str, key: bytes, all_partitions: List[int], available: List[int]) -> int:
        """Optimized partition method with advanced load balancing"""
        if not available:
            available = all_partitions
        
        if key is None:
            return self._fast_hash(str(time.time())) % len(available)
        
        num_partitions = len(all_partitions)
        current_time = time.time()
    
        # Convert key consistently and efficiently
        key_str = key.decode('utf-8') if isinstance(key, bytes) else str(key)
        cache_key = f"{topic}:{key_str}"
    
        chosen_partition = None
    
        # Do everything under a single lock to prevent race conditions
        with self._lock:
            # Check cache
            if cache_key in self.partition_cache:
                cached_time = self.cache_timestamps.get(cache_key, 0)
                if current_time - cached_time <= self.cache_ttl:
                    cached_partition = self.partition_cache[cache_key]
                    if cached_partition in available:
                        return cached_partition
    
            # Get base partition using murmur hash
            base_partition = self._fast_hash(key_str) % num_partitions
        
            # Update hot partitions periodically
            if current_time - self.last_rebalance >= self.rebalance_interval:
                # Calculate loads while still under lock
                loads = [(p, self.partition_loads[topic][p]) 
                        for p in range(num_partitions)]
            
                if loads:
                    total_load = sum(load for _, load in loads)
                    if total_load > 0:
                        avg_load = total_load / len(loads)
                        threshold = avg_load * self.hot_partition_threshold
                    
                        variance = sum((load - avg_load) ** 2 for _, load in loads) / len(loads)
                        std_dev = variance ** 0.5
                    
                        self.hot_partitions = {
                            (topic, p) for p, load in loads 
                            if load > threshold and load > avg_load + std_dev
                        }
            
                self.last_rebalance = current_time
        
            # Choose partition based on load
            if (topic, base_partition) in self.hot_partitions:
                # Find least loaded partition while still under lock
                loads = [(p, self.partition_loads[topic][p]) for p in available]
                chosen_partition = min(loads, key=lambda x: x[1])[0] if loads else available[0]
            else:
                chosen_partition = base_partition
        
            # Update cache and load tracking
            self.partition_cache[cache_key] = chosen_partition
            self.cache_timestamps[cache_key] = current_time
            self.partition_loads[topic][chosen_partition] += 1
    
        return chosen_partition

    def clear_cache(self):
        """Clear the partition cache safely"""
        with self._lock:
            self.partition_cache.clear()
            self.cache_timestamps.clear()
            self.hot_partitions.clear()