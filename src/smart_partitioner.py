from kafka.partitioner import DefaultPartitioner
from load_tracker import LoadTracker

class SmartPartitioner(DefaultPartitioner):
    def __init__(self):
        super().__init__()
        self.load_tracker = LoadTracker()
    
    def partition(self, topic, key, all_partitions, available):  # Added topic parameter
        """
        Determines the partition for a message.
        
        Args:
            topic (str): The topic name
            key (bytes): The key of the message (may be None)
            all_partitions (list): List of all partitions
            available (list): List of available partitions
        
        Returns:
            int: The chosen partition number
        """
        if not available:
            available = all_partitions
            
        num_partitions = len(all_partitions)
        
        # Get base partition using default partitioner
        base_partition = super().partition(topic, key, all_partitions, available)
        
        # If key is None, just use default partitioning
        if key is None:
            return base_partition
            
        # Convert key to string if it's bytes
        key_str = key.decode('utf-8') if isinstance(key, bytes) else str(key)
        
        # Check if this would create a hot partition
        if self.load_tracker.is_hot_partition(topic, base_partition):
            least_loaded = self.load_tracker.get_least_loaded_partition(topic, num_partitions)
            print(f"Redirecting message with key {key_str} from partition {base_partition} to {least_loaded}")
            return least_loaded
            
        # Update load tracker
        self.load_tracker.record_message(topic, base_partition)
        return base_partition