(function() {
'use strict';

function fmt(n) {
  if (n == null) return '—';
  if (typeof n === 'number' && n > 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (typeof n === 'number' && n > 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n ?? '—');
}

function fmtCost(n) {
  if (n == null) return '—';
  return '$' + Number(n).toFixed(2);
}

function fmtDate(d) {
  if (!d) return '—';
  return d.slice(0, 10);
}

// --- Dashboard page ---
if (document.querySelector('.stats-grid')) {
  const summaryUrl = '/api/summary';

  fetch(summaryUrl)
    .then(r => r.json())
    .then(data => {
      document.querySelector('[data-stat="sessions"]').textContent = fmt(data.total_sessions);
      document.querySelector('[data-stat="requests"]').textContent = fmt(data.total_requests);
      document.querySelector('[data-stat="cost"]').textContent = fmtCost(data.total_cost);
      document.querySelector('[data-stat="cost_30d"]').textContent = fmtCost(data.cost_30d);
      document.querySelector('[data-stat="cost_7d"]').textContent = fmtCost(data.cost_7d);
      document.querySelector('[data-stat="input"]').textContent = fmt(data.total_input_tokens);
      document.querySelector('[data-stat="output"]').textContent = fmt(data.total_output_tokens);
      document.querySelector('[data-stat="cache"]').textContent = fmt(data.total_cache_tokens);
      document.getElementById('session-count').textContent = fmt(data.total_sessions);
    })
    .catch(() => {
      document.querySelectorAll('[data-stat]').forEach(el => el.textContent = 'error');
    });

  // --- Timeseries chart ---
  const costCtx = document.getElementById('cost-chart');
  let costChart = null;

  function loadTimeseries() {
    const range = document.getElementById('range-select').value;
    const bucket = document.getElementById('bucket-select').value;
    fetch('/api/timeseries?range=' + range + '&bucket=' + bucket)
      .then(r => r.json())
      .then(data => {
        const labels = data.map(d => d.period);
        const costs = data.map(d => d.cost);
        const sessions = data.map(d => d.sessions);

        if (costChart) costChart.destroy();

        costChart = new Chart(costCtx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Costo ($)',
                data: costs,
                backgroundColor: 'rgba(0, 212, 170, 0.6)',
                borderColor: 'rgba(0, 212, 170, 1)',
                borderWidth: 1,
                borderRadius: 3,
                yAxisID: 'y',
              },
              {
                label: 'Sesiones',
                data: sessions,
                type: 'line',
                borderColor: '#ffb454',
                backgroundColor: 'rgba(255, 180, 84, 0.1)',
                pointRadius: 3,
                pointHoverRadius: 5,
                tension: 0.3,
                yAxisID: 'y1',
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                labels: { color: '#9aa0ac', font: { size: 11, family: 'JetBrains Mono, monospace' } }
              }
            },
            scales: {
              x: {
                ticks: { color: '#626877', font: { size: 10 } },
                grid: { color: '#1e222b' }
              },
              y: {
                beginAtZero: true,
                ticks: { color: '#626877', font: { size: 10 }, callback: v => '$' + v.toFixed(1) },
                grid: { color: '#1e222b' }
              },
              y1: {
                beginAtZero: true,
                position: 'right',
                ticks: { color: '#626877', font: { size: 10 } },
                grid: { display: false }
              }
            }
          }
        });
      });
  }

  document.getElementById('range-select').addEventListener('change', loadTimeseries);
  document.getElementById('bucket-select').addEventListener('change', loadTimeseries);
  loadTimeseries();

  // --- Models chart ---
  const modelsCtx = document.getElementById('models-chart');

  fetch('/api/models?limit=15')
    .then(r => r.json())
    .then(data => {
      const labels = data.map(d => d.model).reverse();
      const costs = data.map(d => d.cost).reverse();

      new Chart(modelsCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Costo ($)',
            data: costs,
            backgroundColor: 'rgba(0, 212, 170, 0.5)',
            borderColor: 'rgba(0, 212, 170, 0.8)',
            borderWidth: 1,
            borderRadius: 3,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { color: '#626877', font: { size: 10 } },
              grid: { color: '#1e222b' }
            },
            y: {
              ticks: { color: '#9aa0ac', font: { size: 10, family: 'JetBrains Mono, monospace' } },
              grid: { display: false }
            }
          }
        }
      });
    });

  // --- Sources chart ---
  const sourcesCtx = document.getElementById('sources-chart');

  fetch('/api/sources')
    .then(r => r.json())
    .then(data => {
      const colors = ['#00d4aa', '#ffb454', '#6c5ce7', '#fd79a8', '#626877'];
      new Chart(sourcesCtx, {
        type: 'doughnut',
        data: {
          labels: data.map(d => d.source),
          datasets: [{
            data: data.map(d => d.cost),
            backgroundColor: colors.slice(0, data.length),
            borderWidth: 0,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#9aa0ac', font: { size: 11, family: 'JetBrains Mono, monospace' }, padding: 16 }
            }
          }
        }
      });
    });
}

// --- Sessions page ---
if (document.getElementById('sessions-tbody')) {
  let offset = 0;
  const limit = 50;
  let sourceFilter = '';

  function loadSessions() {
    const tbody = document.getElementById('sessions-tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="loading-row">Cargando...</td></tr>';

    let url = '/api/sessions?limit=' + limit + '&offset=' + offset;
    if (sourceFilter) url += '&source=' + sourceFilter;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        tbody.innerHTML = '';
        const total = data.total;
        document.getElementById('total-sessions-label').textContent = total;
        document.getElementById('page-num').textContent = Math.floor(offset / limit) + 1;
        document.getElementById('prev-page').disabled = offset <= 0;
        document.getElementById('next-page').disabled = (offset + limit) >= total;

        if (data.sessions.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" class="loading-row">Sin resultados</td></tr>';
          return;
        }

        data.sessions.forEach(s => {
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td title="' + (s.id || '') + '">' + (s.id ? s.id.slice(0, 24) + '…' : '—') + '</td>' +
            '<td>' + fmtDate(s.date) + '</td>' +
            '<td>' + (s.source || '—') + '</td>' +
            '<td class="num">' + fmt(s.requests) + '</td>' +
            '<td class="num">' + fmt(s.input_tokens) + '</td>' +
            '<td class="num">' + fmt(s.output_tokens) + '</td>' +
            '<td class="num">' + fmt(s.cache_tokens) + '</td>' +
            '<td class="num">' + fmtCost(s.cost) + '</td>';
          tbody.appendChild(tr);
        });
      })
      .catch(() => {
        tbody.innerHTML = '<tr><td colspan="8" class="loading-row">Error al cargar</td></tr>';
      });
  }

  document.getElementById('prev-page').addEventListener('click', () => {
    if (offset > 0) { offset -= limit; loadSessions(); }
  });
  document.getElementById('next-page').addEventListener('click', () => {
    offset += limit; loadSessions();
  });
  document.getElementById('source-filter').addEventListener('change', e => {
    sourceFilter = e.target.value;
    offset = 0;
    loadSessions();
  });

  loadSessions();
}

// --- Models page ---
if (document.getElementById('models-tbody')) {
  fetch('/api/models?limit=200')
    .then(r => r.json())
    .then(data => {
      const tbody = document.getElementById('models-tbody');
      tbody.innerHTML = '';
      data.forEach((m, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td class="num">' + (i + 1) + '</td>' +
          '<td>' + m.model + '</td>' +
          '<td class="num">' + fmt(m.requests) + '</td>' +
          '<td class="num">' + fmt(m.input_tokens) + '</td>' +
          '<td class="num">' + fmt(m.output_tokens) + '</td>' +
          '<td class="num">' + fmt(m.cache_tokens) + '</td>' +
          '<td class="num">' + fmtCost(m.cost) + '</td>';
        tbody.appendChild(tr);
      });
    });
}

})();
