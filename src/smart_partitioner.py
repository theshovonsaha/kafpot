from kafka.partitioner.default import DefaultPartitioner
from load_tracker import LoadTracker

class SmartPartitioner(DefaultPartitioner):
    def __init__(self):
        super().__init__()
        self.load_tracker = LoadTracker()
    
    def partition(self, key, all_partitions, available):
        num_partitions = len(all_partitions)
        base_partition = super().partition(key, all_partitions, available)
        
        if self.load_tracker.is_hot_partition('demo-topic', base_partition):
            return self.load_tracker.get_least_loaded_partition('demo-topic', num_partitions)
        return base_partition
