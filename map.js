// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1Ijoic2hhcm9ubiIsImEiOiJjbTdjYjl5NHcwMGQ0MmpweTltMnpsb213In0.h19Vhvec7EocoCg8wHDLYw';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18 // Maximum allowed zoom
});

let line_styles = {
  'line-color': '#32D400',
  'line-width': 5,
  'line-opacity': 0.6
};

let stations = [];
let circles;
let trips = [];
let filteredTrips = [];
let filteredStations = [];
let filteredArrivals = new Map();
let filteredDepartures = new Map();
let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);


map.on('load', () => { 
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
      }); 

      map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
      });
    
    map.addLayer({
        id: 'bike-lanes_b',
        type: 'line',
        source: 'boston_route',
        paint: line_styles
      });

    map.addLayer({
        id: 'bike-lanes_c',
        type: 'line',
        source: 'cambridge_route',
        paint: line_styles
      });

    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';

    d3.json(jsonurl)

      .then(jsonData => {
        console.log('Loaded JSON Data:', jsonData);  
        stations = jsonData.data.stations;

        const traffic_data_url = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
        
        return d3.csv(traffic_data_url);
      })

      .then(tripsData => {
        console.log('Loaded CSV Data:', tripsData);
        trips = tripsData; 

        for (let trip of trips) {
            trip.started_at = new Date(trip.started_at);  
            trip.ended_at = new Date(trip.ended_at);
          }


        let departures = d3.rollup(
          trips,
          (v) => v.length,
          (d) => d.start_station_id,
          );
      
        let arrivals = d3.rollup(
          trips,
          (v) => v.length,
          (d) => d.end_station_id,
          );
    
        stations = stations.map((station) => {
          let id = station.short_name;
          station.arrivals = arrivals.get(id) ?? 0;
          station.departures = departures.get(id) ?? 0;
          station.totalTraffic = station.arrivals + station.departures;
          return station;
          });
  
        const radiusScale = d3
          .scaleSqrt()
          .domain([0, d3.max(stations, (d) => d.totalTraffic)])
          .range([0, 25]);
        
        // Append circles to the SVG for each station
        const svg = d3.select('#map').select('svg');
        circles = svg.selectAll('circle')
          .data(stations)
          .enter()
          .append('circle')
          .attr('r', d => radiusScale(d.totalTraffic))
          .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic)) 
          .each(function(d) {
            // Add <title> for browser tooltips
            d3.select(this)
              .append('title')
              .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`)          
            });

        // Initial position update when map loads
        updatePositions();
        filterTripsbyTime();
    })
    .catch(error => {
      console.error('Error loading JSON:', error);  // Handle errors if JSON loading fails
  });
});


function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point);  // Project to pixel coordinates
  return { cx: x, cy: y };  // Return as object for use in SVG attributes
}

function updatePositions() {
  circles
    .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
    .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
}

// Reposition markers on map interactions
map.on('move', updatePositions);     // Update during map movement
map.on('zoom', updatePositions);     // Update during zooming
map.on('resize', updatePositions);   // Update on window resize
map.on('moveend', updatePositions);  // Final adjustment after movement ends


// slider
let timeFilter = -1;
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
  return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterTripsbyTime() {
  filteredTrips = timeFilter === -1
      ? trips
      : trips.filter((trip) => {
          const startedMinutes = minutesSinceMidnight(trip.started_at);
          const endedMinutes = minutesSinceMidnight(trip.ended_at);
          return (
            Math.abs(startedMinutes - timeFilter) <= 60 ||
            Math.abs(endedMinutes - timeFilter) <= 60
          );
        });

      // we need to update the station data here explained in the next couple paragraphs
      $: {
        filteredArrivals = 
          d3.rollup(
            filteredTrips,
            (v) => v.length,
            (d) => d.end_station_id,
          );
      
        filteredDepartures = 
          d3.rollup(
            filteredTrips,
            (v) => v.length,
            (d) => d.start_station_id,
          );
      }

      $: {
        filteredStations = stations.map((station) => {

          const newStation = { ...station };
          const id = newStation.short_name;
      
          newStation.arrivals = filteredArrivals.get(id) ?? 0;
          newStation.departures = filteredDepartures.get(id) ?? 0;
          newStation.totalTraffic = newStation.arrivals + newStation.departures;
      
          return newStation;
        });
      }

      $: {
        // Update the radius scale based on filtered stations
        const radiusScale = d3
          .scaleSqrt()
          .domain([0, d3.max(filteredStations, (d) => d.totalTraffic)])
          .range(timeFilter === -1 ? [0, 25] : [3, 25]); 
      
        // Update the circles on the map
        circles
          .data(filteredStations, (d) => d.short_name)
          .attr('r', (d) => radiusScale(d.totalTraffic))
          .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));
      }
}

function updateTimeDisplay() {
  timeFilter = Number(timeSlider.value);  // Get slider value

  if (timeFilter === -1) {
    selectedTime.textContent = '';  // Clear time display
    anyTimeLabel.style.display = 'block';  // Show "(any time)"
  } else {
    selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
    anyTimeLabel.style.display = 'none';  // Hide "(any time)"   
  } 

  filterTripsbyTime();
}

timeSlider.addEventListener('input', updateTimeDisplay);

updateTimeDisplay();
