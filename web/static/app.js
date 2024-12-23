// Get React hooks from global React object
const { useState, useEffect, useRef } = React;

const MetricCard = ({ icon, title, value }) => {
  return React.createElement(
    'div',
    { className: 'bg-gray-50 p-4 rounded-lg' },
    React.createElement(
      'div',
      { className: 'flex items-center justify-between' },
      React.createElement('div', { className: 'text-gray-600' }, icon),
      React.createElement(
        'div',
        { className: 'text-right' },
        React.createElement(
          'div',
          { className: 'text-sm text-gray-500' },
          title
        ),
        React.createElement(
          'div',
          { className: 'text-xl font-semibold' },
          value
        )
      )
    )
  );
};

const MetricRow = ({ label, value }) => {
  return React.createElement(
    'div',
    { className: 'flex justify-between items-center' },
    React.createElement('span', { className: 'text-gray-600' }, label),
    React.createElement('span', { className: 'font-semibold' }, value)
  );
};

const KafkaAnalytics = () => {
  const [data, setData] = useState([]);
  const [totalMessages, setTotalMessages] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [error, setError] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastRunDuration, setLastRunDuration] = useState(null);
  const [consumerLag, setConsumerLag] = useState(0);
  const [partitionHealth, setPartitionHealth] = useState('Healthy');
  const [historicalData, setHistoricalData] = useState([]);
  const [activeMode, setActiveMode] = useState(null);

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const wsRef = useRef(null);

  const [metrics, setMetrics] = useState({
    normal: {
      avgThroughput: 0,
      maxPartitionSkew: 0,
      avgLatency: 0,
      balanceScore: 0,
    },
    smart: {
      avgThroughput: 0,
      maxPartitionSkew: 0,
      avgLatency: 0,
      balanceScore: 0,
    },
  });

  const sendCommand = (command) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(command);
      const mode = command.includes('smart') ? 'smart' : 'normal';
      if (command.startsWith('start')) {
        setIsRunning(true);
        setStartTime(Date.now());
        setElapsedTime(0);
        setActiveMode(mode);
      } else if (command === 'stop') {
        setIsRunning(false);
        const duration = Math.floor((Date.now() - startTime) / 1000);
        setLastRunDuration(duration);
        setStartTime(null);
        setElapsedTime(0);
        setActiveMode(null);
      }
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  useEffect(() => {
    let interval = null;
    if (isRunning) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log('Elapsed:', elapsed);
        setElapsedTime(elapsed);

        // Update historical data
        const newDataPoint = {
          timestamp: Date.now(),
          messages: totalMessages,
          mode: activeMode,
        };
        console.log('historical data:', his);
        setHistoricalData((prev) => [...prev, newDataPoint]);

        // Calculate metrics
        if (data.length > 0) {
          const throughput = totalMessages / elapsed;
          const partitionValues = data.map((item) => item.messages);
          const maxSkew =
            Math.max(...partitionValues) - Math.min(...partitionValues);
          const balance = 1 - maxSkew / totalMessages;

          setMetrics((prev) => ({
            ...prev,
            [activeMode]: {
              avgThroughput: throughput,
              maxPartitionSkew: maxSkew,
              avgLatency: Math.random() * 10 + 5, // Simulated latency
              balanceScore: balance * 100,
            },
          }));
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, totalMessages, data]);

  // Chart effect
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
        },
      });
    }
  }, [data]);

  // WebSocket setup effect
  useEffect(() => {
    const connectWebSocket = () => {
      const ws = new WebSocket(`ws://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('Connected');
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const { partitionCounts, totalMessages, consumerLag } = message;

          // Update consumer lag
          setConsumerLag(consumerLag);

          const chartData = Object.entries(partitionCounts).map(
            ([partition, count]) => ({
              partition: `Partition ${partition}`,
              messages: count,
              percentage: ((count / totalMessages) * 100).toFixed(1),
            })
          );

          setData(chartData);
          setTotalMessages(totalMessages);

          // Calculate metrics for active mode
          if (isRunning && activeMode) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const throughput = elapsed > 0 ? totalMessages / elapsed : 0;

            // Calculate partition skew
            const partitionValues = Object.values(partitionCounts);
            const maxMessages = Math.max(...partitionValues);
            const minMessages = Math.min(...partitionValues);
            const skew = maxMessages - minMessages;

            // Calculate balance score
            const idealDistribution = totalMessages / partitionValues.length;
            const maxDeviation = Math.max(
              ...partitionValues.map((count) =>
                Math.abs(count - idealDistribution)
              )
            );
            const balanceScore =
              totalMessages > 0 ? (1 - maxDeviation / totalMessages) * 100 : 0;

            // Update metrics for both modes
            setMetrics((prev) => ({
              ...prev,
              [activeMode]: {
                avgThroughput: throughput,
                maxPartitionSkew: skew,
                avgLatency: Math.random() * 10 + 5,
                balanceScore: balanceScore,
              },
            }));
          }
        } catch (error) {
          console.error('WebSocket message processing error:', error);
          setError('Error processing server data');
        }
      };

      ws.onclose = () => {
        setConnectionStatus('Disconnected');
        setError('Connection lost. Attempting to reconnect...');
        setTimeout(connectWebSocket, 3000);
      };
    };

    connectWebSocket();
    return () => wsRef.current?.close();
  }, []);

  // Historical Chart Effect
  useEffect(() => {
    if (historicalData.length > 0) {
      const ctx = document.getElementById('historicalChart').getContext('2d');
      const chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: historicalData.map((d) =>
            new Date(d.timestamp).toLocaleTimeString()
          ),
          datasets: [
            {
              label: 'Message Throughput',
              data: historicalData.map((d) => d.messages),
              borderColor: 'rgb(59, 130, 246)',
              tension: 0.1,
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
        },
      });

      return () => chart.destroy();
    }
  }, [historicalData]);

  return React.createElement(
    'div',
    { className: 'p-6 max-w-7xl mx-auto' },
    React.createElement(
      'div',
      { className: 'bg-white shadow-lg rounded-lg p-6' },
      // Header
      React.createElement(
        'div',
        { className: 'flex items-center justify-between mb-6' },
        React.createElement(
          'h1',
          { className: 'text-3xl font-bold' },
          'Kafka Partition Analytics'
        ),
        React.createElement(
          'div',
          { className: 'flex items-center space-x-2' },
          React.createElement(
            'div',
            { className: 'flex items-center gap-2' },
            React.createElement(
              'span',
              {
                className: `px-3 py-1 rounded-full ${
                  connectionStatus === 'Connected'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`,
              },
              connectionStatus
            ),
            activeMode &&
              React.createElement(
                'span',
                {
                  className: 'px-3 py-1 rounded-full bg-blue-100 text-blue-800',
                },
                `${activeMode} Mode Active`
              )
          )
        )
      ),

      // Key Metrics Grid
      React.createElement(
        'div',
        {
          className:
            'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6',
        },
        React.createElement(MetricCard, {
          title: 'Messages/sec',
          value: activeMode
            ? (metrics[activeMode].avgThroughput || 0).toFixed(1)
            : '0.0',
        }),
        React.createElement(MetricCard, {
          title: 'Avg Latency',
          value: `${
            activeMode
              ? (metrics[activeMode].avgLatency || 0).toFixed(1)
              : '0.0'
          } ms`,
        }),
        React.createElement(MetricCard, {
          title: 'Total Messages',
          value: totalMessages.toLocaleString(),
        }),
        React.createElement(MetricCard, {
          title: 'Consumer Lag',
          value: consumerLag.toString(),
        }),
        React.createElement(MetricCard, {
          title: 'Partition Health',
          value: partitionHealth,
          className:
            partitionHealth === 'Healthy'
              ? 'text-green-600'
              : 'text-yellow-600',
        })
      ),

      // Error Display
      error &&
        React.createElement(
          'div',
          { className: 'bg-red-50 border-l-4 border-red-500 p-4 mb-6' },
          React.createElement('p', { className: 'text-red-700' }, error)
        ),

      // Historical Data Chart
      React.createElement(
        'div',
        { className: 'mb-8' },
        React.createElement(
          'h2',
          { className: 'text-xl font-semibold mb-4' },
          'Message Throughput History'
        ),
        React.createElement(
          'div',
          { className: 'h-64' },
          React.createElement('canvas', {
            id: 'historicalChart',
            className: 'w-full h-full',
          })
        )
      ),

      // Runtime Information
      React.createElement(
        'div',
        { className: 'bg-blue-50 p-4 rounded-lg mb-8' },
        React.createElement(
          'div',
          { className: 'grid grid-cols-1 md:grid-cols-3 gap-4' },
          React.createElement(MetricRow, {
            label: 'Current Run',
            value: isRunning ? formatDuration(elapsedTime) : 'Not Running',
          }),
          React.createElement(MetricRow, {
            label: 'Last Run Duration',
            value: lastRunDuration ? formatDuration(lastRunDuration) : 'N/A',
          }),
          React.createElement(MetricRow, {
            label: 'Active Mode',
            value: activeMode
              ? activeMode.charAt(0).toUpperCase() + activeMode.slice(1)
              : 'None',
          })
        )
      ),

      // Partition Distribution Chart
      React.createElement(
        'div',
        { className: 'mb-8' },
        React.createElement(
          'h2',
          { className: 'text-xl font-semibold mb-4' },
          'Partition Distribution'
        ),
        React.createElement(
          'div',
          { className: 'h-96' },
          React.createElement('canvas', {
            ref: chartRef,
            className: 'w-full h-full',
          })
        )
      ),

      // Comparison Section
      React.createElement(
        'div',
        { className: 'mb-8' },
        React.createElement(
          'h2',
          { className: 'text-xl font-semibold mb-4' },
          'Performance Comparison'
        ),
        React.createElement(
          'div',
          { className: 'grid grid-cols-1 lg:grid-cols-2 gap-6' },
          // Normal Mode Stats
          React.createElement(
            'div',
            { className: 'bg-gray-50 p-4 rounded-lg' },
            React.createElement(
              'h3',
              { className: 'font-semibold mb-3' },
              'Normal Partitioning'
            ),
            React.createElement(
              'div',
              { className: 'space-y-2' },
              React.createElement(MetricRow, {
                label: 'Throughput',
                value: `${metrics.normal.avgThroughput.toFixed(1)} msg/s`,
              }),
              React.createElement(MetricRow, {
                label: 'Partition Skew',
                value: `${metrics.normal.maxPartitionSkew.toFixed(1)} messages`,
              }),
              React.createElement(MetricRow, {
                label: 'Balance Score',
                value: `${metrics.normal.balanceScore.toFixed(1)}%`,
              })
            )
          ),
          // Smart Mode Stats
          React.createElement(
            'div',
            { className: 'bg-gray-50 p-4 rounded-lg' },
            React.createElement(
              'h3',
              { className: 'font-semibold mb-3' },
              'Smart Partitioning'
            ),
            React.createElement(
              'div',
              { className: 'space-y-2' },
              React.createElement(MetricRow, {
                label: 'Throughput',
                value: `${metrics.smart.avgThroughput.toFixed(1)} msg/s`,
              }),
              React.createElement(MetricRow, {
                label: 'Partition Skew',
                value: `${metrics.smart.maxPartitionSkew.toFixed(1)} messages`,
              }),
              React.createElement(MetricRow, {
                label: 'Balance Score',
                value: `${metrics.smart.balanceScore.toFixed(1)}%`,
              })
            )
          )
        )
      ),

      // Control Buttons
      React.createElement(
        'div',
        { className: 'flex gap-4' },
        React.createElement(
          'button',
          {
            onClick: () => sendCommand('start normal'),
            disabled: isRunning,
            className: `px-6 py-3 rounded-lg font-semibold ${
              isRunning
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`,
          },
          'Start Normal Mode'
        ),
        React.createElement(
          'button',
          {
            onClick: () => sendCommand('start smart'),
            disabled: isRunning,
            className: `px-6 py-3 rounded-lg font-semibold ${
              isRunning
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`,
          },
          'Start Smart Mode'
        ),
        React.createElement(
          'button',
          {
            onClick: () => sendCommand('stop'),
            disabled: !isRunning,
            className: `px-6 py-3 rounded-lg font-semibold ${
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
  React.createElement(KafkaAnalytics),
  document.getElementById('root')
);
