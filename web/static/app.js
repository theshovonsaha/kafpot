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

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

const ComparisonMetric = ({ label, normalValue, smartValue }) => {
  const getPercentChange = () => {
    if (!normalValue || !smartValue) return null;
    const change = ((smartValue - normalValue) / normalValue) * 100;
    return {
      value: Math.abs(change).toFixed(1),
      isImprovement: change > 0,
    };
  };

  const change = getPercentChange();

  return React.createElement(
    'div',
    { className: 'grid grid-cols-3 gap-4 py-2 border-b border-gray-200' },
    React.createElement('div', { className: 'text-gray-600' }, label),
    React.createElement(
      'div',
      { className: 'text-center font-mono' },
      normalValue?.toFixed(1) || 'N/A'
    ),
    React.createElement(
      'div',
      { className: 'text-right font-mono' },
      React.createElement(
        'div',
        { className: 'flex items-center justify-end gap-2' },
        smartValue?.toFixed(1) || 'N/A',
        change &&
          React.createElement(
            'span',
            {
              className: `text-sm ${
                change.isImprovement ? 'text-green-600' : 'text-red-600'
              }`,
            },
            `${change.isImprovement ? '↑' : '↓'} ${change.value}%`
          )
      )
    )
  );
};

const PerformanceComparison = ({ previousRunMetrics }) => {
  if (!previousRunMetrics.normal && !previousRunMetrics.smart) {
    return null;
  }

  return React.createElement(
    'div',
    { className: 'bg-white rounded-lg shadow p-6 mb-8' },
    React.createElement(
      'h2',
      { className: 'text-xl font-semibold mb-4' },
      'Performance Comparison'
    ),
    React.createElement(
      'div',
      {
        className:
          'grid grid-cols-3 gap-4 mb-4 pb-2 border-b border-gray-200 font-semibold',
      },
      React.createElement('div', null, 'Metric'),
      React.createElement('div', { className: 'text-center' }, 'Normal Mode'),
      React.createElement('div', { className: 'text-right' }, 'Smart Mode')
    ),
    React.createElement(ComparisonMetric, {
      label: 'Throughput (msg/ms)',
      normalValue: previousRunMetrics.normal?.metrics.throughput,
      smartValue: previousRunMetrics.smart?.metrics.throughput,
    }),
    React.createElement(ComparisonMetric, {
      label: 'Balance Score (%)',
      normalValue: previousRunMetrics.normal?.metrics.balanceScore,
      smartValue: previousRunMetrics.smart?.metrics.balanceScore,
    }),
    React.createElement(ComparisonMetric, {
      label: 'Partition Skew',
      normalValue: previousRunMetrics.normal?.metrics.partitionSkew,
      smartValue: previousRunMetrics.smart?.metrics.partitionSkew,
    })
  );
};

const KafkaAnalytics = () => {
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [error, setError] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeMode, setActiveMode] = useState(null);
  const [currentMetrics, setCurrentMetrics] = useState({
    totalMessages: 0,
    consumerLag: 0,
    partitionHealth: 'Healthy',
    throughput: 0,
    partitionSkew: 0,
    balanceScore: 0,
  });
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastRunDuration, setLastRunDuration] = useState(null);
  const [historicalData, setHistoricalData] = useState({
    normal: [],
    smart: [],
  });
  const [previousRunMetrics, setPreviousRunMetrics] = useState({
    normal: null,
    smart: null,
  });

  // Refs
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const wsRef = useRef(null);

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current) return;

    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Current Run',
            borderColor:
              activeMode === 'smart' ? 'rgb(34, 197, 94)' : 'rgb(59, 130, 246)',
            backgroundColor:
              activeMode === 'smart'
                ? 'rgba(34, 197, 94, 0.1)'
                : 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            data: [],
            fill: true,
            tension: 0.4,
            pointRadius: 1,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'linear',
            title: {
              display: true,
              text: 'Time Elapsed (seconds)',
            },
          },
          y: {
            type: 'linear',
            title: {
              display: true,
              text: 'Messages/Second',
            },
            beginAtZero: true,
          },
        },
        plugins: {
          legend: {
            position: 'top',
          },
        },
        animation: false,
      },
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, []);

  // WebSocket connection
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
          const currentTime = Date.now();
          const elapsed = startTime ? (currentTime - startTime) / 10000 : 0;

          // Calculate metrics from the received data
          const metrics = {
            totalMessages,
            consumerLag,
            partitionHealth: 'Healthy',
            throughput: elapsed > 0 ? totalMessages / elapsed : 0,
            partitionSkew: partitionCounts
              ? Math.max(...Object.values(partitionCounts)) -
                Math.min(...Object.values(partitionCounts))
              : 0,
            balanceScore:
              partitionCounts && totalMessages
                ? 100 *
                  (1 -
                    Math.max(...Object.values(partitionCounts)) / totalMessages)
                : 0,
          };

          setCurrentMetrics(metrics);

          // Update historical data and chart if running
          if (isRunning && activeMode) {
            const newDataPoint = {
              timestamp: currentTime,
              elapsed,
              throughput: metrics.throughput,
            };

            setHistoricalData((prev) => ({
              ...prev,
              [activeMode]: [...prev[activeMode], newDataPoint],
            }));

            // Update chart
            if (chartInstance.current) {
              const chart = chartInstance.current;
              // Set correct color based on mode
              chart.data.datasets[0].borderColor =
                activeMode === 'smart'
                  ? 'rgb(34, 197, 94)'
                  : 'rgb(59, 130, 246)';
              chart.data.datasets[0].backgroundColor =
                activeMode === 'smart'
                  ? 'rgba(34, 197, 94, 0.1)'
                  : 'rgba(59, 130, 246, 0.1)';
              chart.data.datasets[0].label = `${
                activeMode.charAt(0).toUpperCase() + activeMode.slice(1)
              } Mode`;
              chart.data.datasets[0].data.push({
                x: elapsed,
                y: metrics.throughput,
              });
              chart.update('none');
            }
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
  }, [startTime, isRunning, activeMode]);

  // Timer effect
  useEffect(() => {
    let interval = null;
    if (isRunning && startTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, startTime]);

  // Simplified sendCommand function - let backend handle the comparison timing
  const sendCommand = (command) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(command);

      if (command === 'compare') {
        // Just reset state and let backend handle the rest
        setIsRunning(true);
        setStartTime(Date.now());
        setElapsedTime(0);
        setActiveMode('normal');
        setHistoricalData({ normal: [], smart: [] });

        if (chartInstance.current) {
          chartInstance.current.data.datasets[0].data = [];
          chartInstance.current.data.datasets[0].label = 'Normal Mode';
          chartInstance.current.data.datasets[0].borderColor =
            'rgb(59, 130, 246)';
          chartInstance.current.data.datasets[0].backgroundColor =
            'rgba(59, 130, 246, 0.1)';
          chartInstance.current.update();
        }
      } else if (command.startsWith('start')) {
        const mode = command.includes('smart') ? 'smart' : 'normal';
        setIsRunning(true);
        setStartTime(Date.now());
        setElapsedTime(0);
        setActiveMode(mode);
        setHistoricalData((prev) => ({ ...prev, [mode]: [] }));

        if (chartInstance.current) {
          chartInstance.current.data.datasets[0].data = [];
          chartInstance.current.data.datasets[0].label = `${
            mode.charAt(0).toUpperCase() + mode.slice(1)
          } Mode`;
          chartInstance.current.data.datasets[0].borderColor =
            mode === 'smart' ? 'rgb(34, 197, 94)' : 'rgb(59, 130, 246)';
          chartInstance.current.data.datasets[0].backgroundColor =
            mode === 'smart'
              ? 'rgba(34, 197, 94, 0.1)'
              : 'rgba(59, 130, 246, 0.1)';
          chartInstance.current.update();
        }
      } else if (command === 'stop') {
        if (activeMode) {
          setPreviousRunMetrics((prev) => ({
            ...prev,
            [activeMode]: {
              data: historicalData[activeMode].map((point) => ({
                x: point.elapsed,
                y: point.throughput,
              })),
              metrics: currentMetrics,
            },
          }));
        }
        setIsRunning(false);
        setLastRunDuration(elapsedTime);
        setStartTime(null);
        setActiveMode(null);
      }
    }
  };

  // Render component using React.createElement
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
      ),

      // Metrics Grid
      React.createElement(
        'div',
        {
          className:
            'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6',
        },
        React.createElement(MetricCard, {
          icon: '📊',
          title: 'Messages/sec',
          value: currentMetrics.throughput.toFixed(1),
        }),
        React.createElement(MetricCard, {
          icon: '📝',
          title: 'Total Messages',
          value: currentMetrics.totalMessages.toLocaleString(),
        }),
        React.createElement(MetricCard, {
          icon: '⚖️',
          title: 'Balance Score',
          value: `${currentMetrics.balanceScore.toFixed(1)}%`,
        }),
        React.createElement(MetricCard, {
          icon: '🔄',
          title: 'Partition Skew',
          value: currentMetrics.partitionSkew.toString(),
        })
      ),

      // Chart
      React.createElement(
        'div',
        { className: 'mb-8' },
        React.createElement(
          'h2',
          { className: 'text-xl font-semibold mb-4' },
          'Performance Metrics'
        ),
        React.createElement(
          'div',
          { className: 'h-96 bg-gray-50 rounded-lg p-4' },
          React.createElement('canvas', {
            ref: chartRef,
            className: 'w-full h-full',
          })
        )
      ),

      // Run Information
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

      // Performance Comparison
      React.createElement(PerformanceComparison, {
        previousRunMetrics: previousRunMetrics,
      }),

      // Control Buttons
      React.createElement(
        'div',
        { className: 'flex gap-4 flex-wrap' },
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
            onClick: () => sendCommand('compare'),
            disabled: isRunning,
            className: `px-6 py-3 rounded-lg font-semibold ${
              isRunning
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-purple-500 hover:bg-purple-600 text-white'
            }`,
          },
          'Run Comparison (20s)'
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
