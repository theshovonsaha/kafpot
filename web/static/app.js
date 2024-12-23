const { useState, useEffect, useRef } = React;

const KafkaVisualizer = () => {
  const [data, setData] = useState([]);
  const [totalMessages, setTotalMessages] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [error, setError] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRunTime, setLastRunTime] = useState(null);
  const [currentRunTime, setCurrentRunTime] = useState(null);
  const timerRef = useRef(null);
  const [startTime, setStartTime] = useState(null); // Start time for the current run
  const [elapsedTime, setElapsedTime] = useState(0); // Elapsed time in seconds
  const [lastRunDuration, setLastRunDuration] = useState(null); // Duration of the last run

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const wsRef = useRef(null);

  const sendCommand = (command) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(command);
      if (command.startsWith('start')) {
        setIsRunning(true);
        setStartTime(Date.now()); // Record the current start time
        setElapsedTime(0); // Reset elapsed time for the new run
      } else if (command === 'stop') {
        setIsRunning(false);
        const duration = Math.floor((Date.now() - startTime) / 1000); // Calculate elapsed duration
        setLastRunDuration(duration); // Save the duration of the last run
        setStartTime(null); // Clear the start time
        setElapsedTime(0); // Reset elapsed time
      }
    }
  };
  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  useEffect(() => {
    let interval = null;

    if (isRunning) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000)); // Update elapsed time every second
      }, 1000);
    } else {
      clearInterval(interval);
    }

    return () => clearInterval(interval); // Cleanup on unmount
  }, [isRunning, startTime]);

  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    if (data.length > 0) {
      const ctx = chartRef.current.getContext('2d');
      chartInstance.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.map((item) => item.partition),
          datasets: [
            {
              label: 'Messages per Partition',
              data: data.map((item) => item.messages),
              backgroundColor: 'rgba(59, 130, 246, 0.5)',
              borderColor: 'rgb(59, 130, 246)',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
            },
          },
          animation: {
            duration: 500,
          },
        },
      });
    }
  }, [data]);

  useEffect(() => {
    let ws;

    const connectWebSocket = () => {
      ws = new WebSocket(`ws://${window.location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        console.log('Connected to WebSocket server');
        setConnectionStatus('Connected');
        setError(null);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('Connection Error');
        setError('Failed to connect to the server');
      };

      ws.onclose = () => {
        console.log('WebSocket connection closed');
        setConnectionStatus('Disconnected');
        setError('Connection lost. Attempting to reconnect...');
        setTimeout(connectWebSocket, 3000);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const { partitionCounts, totalMessages } = message;

          const chartData = Object.entries(partitionCounts).map(
            ([partition, count]) => ({
              partition: `Partition ${partition}`,
              messages: count,
              percentage: ((count / totalMessages) * 100).toFixed(1),
            })
          );

          setData(chartData);
          setTotalMessages(totalMessages);
        } catch (error) {
          console.error('Error processing message:', error);
          setError('Error processing server data');
        }
      };
    };

    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, []);

  const formatTime = (time) => {
    return time ? time.toLocaleTimeString() : 'N/A';
  };

  return React.createElement(
    'div',
    { className: 'p-6 max-w-6xl mx-auto' },
    React.createElement(
      'div',
      { className: 'bg-white shadow-lg rounded-lg p-6' },
      React.createElement(
        'h1',
        { className: 'text-2xl font-bold mb-4' },
        'Kafka Partition Distribution'
      ),
      React.createElement(
        'div',
        {
          className: `p-4 mb-6 rounded border-l-4 ${
            error ? 'bg-red-50 border-red-500' : 'bg-blue-50 border-blue-500'
          }`,
        },
        React.createElement(
          'p',
          { className: 'font-semibold' },
          'Status: ',
          connectionStatus
        ),
        React.createElement(
          'p',
          { className: 'font-semibold' },
          'Total Messages: ',
          totalMessages
        ),
        React.createElement(
          'p',
          { className: 'font-semibold' },
          'Last Run: ',
          lastRunDuration !== null ? formatDuration(lastRunDuration) : 'N/A'
        ),
        React.createElement(
          'p',
          { className: 'font-semibold' },
          'Current Run: ',
          isRunning ? formatDuration(elapsedTime) : 'N/A'
        ),
        error &&
          React.createElement('p', { className: 'text-red-600 mt-2' }, error)
      ),
      React.createElement(
        'div',
        { className: 'mb-8 h-96' },
        React.createElement('canvas', {
          ref: chartRef,
          className: 'w-full h-full',
        })
      ),
      React.createElement(
        'div',
        { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' },
        data.map((item, index) =>
          React.createElement(
            'div',
            {
              key: index,
              className: 'bg-gray-50 rounded-lg p-4',
            },
            React.createElement(
              'h3',
              { className: 'font-bold text-lg' },
              item.partition
            ),
            React.createElement(
              'p',
              { className: 'text-gray-600' },
              'Messages: ',
              item.messages
            ),
            React.createElement(
              'p',
              { className: 'text-gray-600' },
              'Load: ',
              item.percentage,
              '%'
            ),
            item.percentage > 40 &&
              React.createElement(
                'div',
                {
                  className: 'mt-2 text-red-500',
                },
                '⚠️ High Load'
              )
          )
        )
      ),
      React.createElement(
        'div',
        { className: 'flex gap-4 mb-6' },
        React.createElement(
          'button',
          {
            onClick: () => sendCommand('start normal'),
            disabled: isRunning,
            className: `px-4 py-2 rounded ${
              isRunning
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`,
          },
          'Start Normal'
        ),
        React.createElement(
          'button',
          {
            onClick: () => sendCommand('start smart'),
            disabled: isRunning,
            className: `px-4 py-2 rounded ${
              isRunning
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`,
          },
          'Start Smart'
        ),
        React.createElement(
          'button',
          {
            onClick: () => sendCommand('stop'),
            disabled: !isRunning,
            className: `px-4 py-2 rounded ${
              !isRunning
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`,
          },
          'Stop'
        )
      )
    )
  );
};

// Render the app
ReactDOM.render(
  React.createElement(KafkaVisualizer),
  document.getElementById('root')
);
