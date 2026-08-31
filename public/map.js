/* US choropleth: D3.js + TopoJSON. Colors states with cached stories. */
(function (global) {
  const TOPO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';
  let cachedTopo = null;

  async function loadTopo() {
    if (cachedTopo) return cachedTopo;
    const res = await fetch(TOPO_URL);
    cachedTopo = await res.json();
    return cachedTopo;
  }

  async function render(container, generatedSet) {
    container.innerHTML = '';
    let tooltip = document.getElementById('map-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'map-tooltip';
      document.body.appendChild(tooltip);
    }

    if (!global.d3 || !global.topojson) {
      container.textContent = 'Map libraries not loaded yet — please refresh.';
      return;
    }

    const us = await loadTopo();
    const width = 960;
    const height = 560;

    const svg = d3.select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const path = d3.geoPath();
    const states = topojson.feature(us, us.objects.states).features;
    const set = new Set([...generatedSet].map((s) => s.toLowerCase()));

    svg.append('g')
      .selectAll('path')
      .data(states)
      .enter()
      .append('path')
      .attr('class', (d) => {
        const name = d.properties.name || '';
        return set.has(name.toLowerCase()) ? 'state generated' : 'state empty';
      })
      .attr('d', path)
      .on('mousemove', (event, d) => {
        const name = d.properties.name || '';
        const on = set.has(name.toLowerCase());
        tooltip.textContent = `${name} — ${on ? 'Visited ✔' : 'Not visited yet'}`;
        tooltip.style.left = `${event.pageX}px`;
        tooltip.style.top = `${event.pageY - 12}px`;
        tooltip.classList.add('is-visible');
      })
      .on('mouseleave', () => tooltip.classList.remove('is-visible'));
  }

  global.MapView = { render };
})(window);
