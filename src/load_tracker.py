from collections import defaultdict
from threading import Lock
from typing import Dict, DefaultDict
from statistics import mean

class LoadTracker:
    def __init__(self):
        self._loads: DefaultDict[str, Dict[int, int]] = defaultdict(lambda: defaultdict(int))
        self._lock = Lock()
    
    def is_hot_partition(self, topic: str, partition: int) -> bool:
        with self._lock:
            partition_loads = self._loads[topic]
            partition_loads[partition] += 1
            
            if not partition_loads:
                return False
            
            avg_load = mean(partition_loads.values())
            return partition_loads[partition] > avg_load * 1.5
    
    def get_least_loaded_partition(self, topic: str, num_partitions: int) -> int:
        with self._lock:
            partition_loads = self._loads[topic]
            if not partition_loads:
                return 0
            
            return min(range(num_partitions), 
                      key=lambda p: partition_loads.get(p, 0))
