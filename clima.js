lucide.createIcons();

        const dropzone = document.getElementById('dropzone');
        const fileInput = document.getElementById('fileInput');
        const dashboard = document.getElementById('dashboard');
        const welcomeScreen = document.getElementById('welcome-screen');
        
        const routeNameEl = document.getElementById('routeName');
        const routeDistEl = document.getElementById('routeDist');
        const routeTypeEl = document.getElementById('routeType');
        
        const btnChangeRouteIcon = document.getElementById('btnChangeRouteIcon');
        const btnChangeRouteText = document.getElementById('btnChangeRouteText');
        
        const inputStartTime = document.getElementById('inputStartTime');
        const inputAvgSpeed = document.getElementById('inputAvgSpeed');
        const inputActivity = document.getElementById('inputActivity');
        const inputPacingMode = document.getElementById('inputPacingMode');
        
        const pacingSelectorContainer = document.getElementById('pacingSelectorContainer');
        const activityContainer = document.getElementById('activityContainer');
        const speedContainer = document.getElementById('speedContainer');
        
        const btnCalcWeather = document.getElementById('btnCalcWeather');
        const alertsContainer = document.getElementById('alertsContainer');
        const loader = document.getElementById('loader');
        const tableBody = document.getElementById('weatherTableBody');

        let map;
        let routeLayer;
        let weatherMarkersLayer;
        let currentRoutePoints = [];
        let hasRealTime = false;

        // Configurar fecha por defecto a mañana a las 09:00
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        
        const tzOffset = tomorrow.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(tomorrow.getTime() - tzOffset)).toISOString().slice(0, 16);
        inputStartTime.value = localISOTime;

        // Cambio de modo de ritmo
        inputPacingMode.addEventListener('change', (e) => {
            const isCustom = e.target.value === 'custom';
            speedContainer.classList.toggle('hidden', !isCustom);
            activityContainer.classList.toggle('hidden', !isCustom);
        });

        // Cambio de Actividad (Bicicleta vs Senderismo)
        inputActivity.addEventListener('change', (e) => {
            if (e.target.value === 'cycling') {
                inputAvgSpeed.value = 15;
            } else if (e.target.value === 'hiking') {
                inputAvgSpeed.value = 4;
            }
            // Pequeña animación para indicar que cambió
            inputAvgSpeed.classList.add('bg-sky-900/50', 'text-sky-300');
            setTimeout(() => inputAvgSpeed.classList.remove('bg-sky-900/50', 'text-sky-300'), 500);
        });

        // Eventos de interfaz GPX
        btnChangeRouteIcon.addEventListener('click', () => fileInput.click());
        btnChangeRouteText.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) handleFile(e.target.files[0]);
        });

        function initMap() {
            if (map) return;
            const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' });
            const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenTopoMap' });

            map = L.map('map', { layers: [osm], zoomControl: false });
            L.control.zoom({ position: 'topright' }).addTo(map);
            L.control.layers({ "Mapa Base": osm, "Topográfico": topo }, null, { position: 'topright' }).addTo(map);

            routeLayer = L.polyline([], { color: '#38bdf8', weight: 5, opacity: 0.8, lineJoin: 'round' }).addTo(map);
            weatherMarkersLayer = L.layerGroup().addTo(map);
        }

        async function handleFile(file) {
            const text = await file.text();
            const track = parseGPX(text, file.name);
            fileInput.value = '';
            
            if (track.points.length === 0) {
                alert("No se pudieron leer datos válidos del archivo GPX.");
                return;
            }

            currentRoutePoints = track.points;
            hasRealTime = track.points.filter(p => p.time !== null).length > 10;

            let totalDist = 0;
            if (currentRoutePoints.length > 0) {
                currentRoutePoints[0].dist = 0;
                for (let i = 1; i < currentRoutePoints.length; i++) {
                    totalDist += haversine(currentRoutePoints[i-1], currentRoutePoints[i]);
                    currentRoutePoints[i].dist = totalDist;
                }
            }

            welcomeScreen.classList.add('hidden');
            dashboard.classList.remove('hidden');
            dashboard.classList.add('flex');
            alertsContainer.classList.add('hidden');
            alertsContainer.innerHTML = '';
            
            routeNameEl.innerText = track.name;
            routeNameEl.title = track.name;
            routeDistEl.innerText = totalDist.toFixed(1) + ' km';
            
            if (hasRealTime) {
                routeTypeEl.innerText = "Actividad Grabada";
                routeTypeEl.className = "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-800/50 bg-emerald-900/30";
                pacingSelectorContainer.classList.remove('hidden');
                inputPacingMode.value = 'original';
                speedContainer.classList.add('hidden');
                activityContainer.classList.add('hidden');
            } else {
                routeTypeEl.innerText = "Ruta Planificada";
                routeTypeEl.className = "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-yellow-500 border border-yellow-800/50 bg-yellow-900/30";
                pacingSelectorContainer.classList.add('hidden');
                inputPacingMode.value = 'custom';
                speedContainer.classList.remove('hidden');
                activityContainer.classList.remove('hidden');
            }

            initMap();
            
            const latlngs = currentRoutePoints.map(p => [p.lat, p.lon]);
            routeLayer.setLatLngs(latlngs);
            map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
            
            weatherMarkersLayer.clearLayers();
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="py-12 text-center text-gray-500 font-medium">
                        <div class="flex flex-col items-center justify-center gap-2">
                            <i data-lucide="check-circle" class="w-8 h-8 text-sky-500"></i>
                            Ruta cargada correctamente. Pulsa "Consultar" para ver la previsión.
                        </div>
                    </td>
                </tr>`;
            lucide.createIcons();
        }

        btnCalcWeather.addEventListener('click', async () => {
            if (currentRoutePoints.length === 0) return;
            
            const startDate = new Date(inputStartTime.value);
            if (isNaN(startDate.getTime())) {
                alert("Por favor, selecciona una fecha y hora válidas.");
                return;
            }

            const daysInFuture = (startDate.getTime() - Date.now()) / (1000 * 3600 * 24);
            if (daysInFuture > 14) {
                alert("La previsión solo está disponible para los próximos 14 días.");
                return;
            }

            const avgSpeed = parseFloat(inputAvgSpeed.value) || 15;
            
            loader.classList.remove('hidden');
            alertsContainer.classList.add('hidden');
            alertsContainer.innerHTML = '';
            
            try {
                await processWeatherForecast(startDate, avgSpeed);
            } catch (error) {
                console.error(error);
                alert("Error al obtener la previsión. Inténtalo de nuevo más tarde.");
            } finally {
                loader.classList.add('hidden');
            }
        });

        async function processWeatherForecast(startDate, avgSpeedKmh) {
            const startTimestampMs = startDate.getTime();
            let refTimestamp = currentRoutePoints[0].time; 
            
            const numSamples = 10;
            const step = Math.max(1, Math.floor(currentRoutePoints.length / numSamples));
            
            let samplePoints = [];
            for (let i = 0; i < currentRoutePoints.length; i += step) {
                samplePoints.push(currentRoutePoints[i]);
            }
            if (samplePoints[samplePoints.length - 1] !== currentRoutePoints[currentRoutePoints.length - 1]) {
                samplePoints.push(currentRoutePoints[currentRoutePoints.length - 1]);
            }

            const useOriginalPacing = hasRealTime && inputPacingMode.value === 'original';

            samplePoints.forEach(pt => {
                if (useOriginalPacing && refTimestamp) {
                    pt.targetTimeMs = startTimestampMs + (pt.time - refTimestamp);
                } else {
                    let hours = pt.dist / avgSpeedKmh;
                    pt.targetTimeMs = startTimestampMs + (hours * 3600000);
                }
            });

            const lats = samplePoints.map(p => p.lat.toFixed(4)).join(',');
            const lons = samplePoints.map(p => p.lon.toFixed(4)).join(',');
            
            // APIs a llamar (Clima y Calidad del Aire/Polen)
            const weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=temperature_2m,precipitation_probability,weathercode,windspeed_10m,winddirection_10m,uv_index&timeformat=unixtime`;
            const pollenApiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&hourly=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&timeformat=unixtime`;

            // Hacemos ambas peticiones en paralelo. Si pollen falla, no rompemos el clima.
            const [weatherRes, pollenRes] = await Promise.all([
                fetch(weatherApiUrl),
                fetch(pollenApiUrl).catch(() => null)
            ]);

            if (!weatherRes.ok) throw new Error("Error HTTP de Open-Meteo Clima");
            
            const weatherDataRaw = await weatherRes.json();
            const pollenDataRaw = pollenRes && pollenRes.ok ? await pollenRes.json() : null;
            
            const resultsArray = Array.isArray(weatherDataRaw) ? weatherDataRaw : [weatherDataRaw];
            const pollenArray = pollenDataRaw ? (Array.isArray(pollenDataRaw) ? pollenDataRaw : [pollenDataRaw]) : [];

            weatherMarkersLayer.clearLayers();
            tableBody.innerHTML = '';
            
            // Variables para calcular máximos y lanzar alertas
            let maxUV = 0, maxWind = 0, maxPrecip = 0, maxPollen = 0;

            samplePoints.forEach((pt, index) => {
                const weatherData = resultsArray[index] || resultsArray[0];
                const pollenData = pollenArray[index] || pollenArray[0];
                if (!weatherData || !weatherData.hourly) return;
                
                const targetUnix = Math.floor(pt.targetTimeMs / 1000);
                const times = weatherData.hourly.time;
                
                let closestIdx = 0;
                let minDiff = Infinity;
                for (let j = 0; j < times.length; j++) {
                    let diff = Math.abs(times[j] - targetUnix);
                    if (diff < minDiff) { minDiff = diff; closestIdx = j; }
                }

                const temp = weatherData.hourly.temperature_2m[closestIdx];
                const precipProb = weatherData.hourly.precipitation_probability[closestIdx];
                const weatherCode = weatherData.hourly.weathercode[closestIdx];
                const windSpeed = weatherData.hourly.windspeed_10m[closestIdx];
                const windDir = weatherData.hourly.winddirection_10m[closestIdx];
                const uvIndex = weatherData.hourly.uv_index[closestIdx] || 0;

                // Sumar tipos de polen si existen
                let totalPollen = 0;
                if (pollenData && pollenData.hourly) {
                    totalPollen = (pollenData.hourly.alder_pollen[closestIdx] || 0) +
                                  (pollenData.hourly.birch_pollen[closestIdx] || 0) +
                                  (pollenData.hourly.grass_pollen[closestIdx] || 0) +
                                  (pollenData.hourly.mugwort_pollen[closestIdx] || 0) +
                                  (pollenData.hourly.olive_pollen[closestIdx] || 0) +
                                  (pollenData.hourly.ragweed_pollen[closestIdx] || 0);
                }

                if (uvIndex > maxUV) maxUV = uvIndex;
                if (windSpeed > maxWind) maxWind = windSpeed;
                if (precipProb > maxPrecip) maxPrecip = precipProb;
                if (totalPollen > maxPollen) maxPollen = totalPollen;

                const wmoInfo = getWMOInfo(weatherCode);
                const colorCode = getTempColor(temp);
                const timeStr = new Date(pt.targetTimeMs).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

                createWeatherMarker(pt, temp, wmoInfo, windDir, windSpeed, precipProb, colorCode, timeStr, uvIndex, totalPollen);
                addTableRow(pt.dist, timeStr, wmoInfo, temp, windSpeed, windDir, precipProb, colorCode, uvIndex, totalPollen);
            });

            generateAlerts(maxWind, maxPrecip, maxUV, maxPollen);
            lucide.createIcons();
        }

        function generateAlerts(maxWind, maxPrecip, maxUV, maxPollen) {
            alertsContainer.innerHTML = '';
            let hasAlerts = false;

            // Alerta de Viento (Naranja > 25 km/h | Rojo > 45 km/h)
            if (maxWind >= 25) {
                hasAlerts = true;
                const isDanger = maxWind >= 45;
                const color = isDanger ? 'bg-red-900/30 border-red-700/50 text-red-400' : 'bg-orange-900/30 border-orange-700/50 text-orange-400';
                const label = isDanger ? 'Viento Peligroso' : 'Viento Fuerte';
                alertsContainer.innerHTML += `
                    <div class="${color} border p-3 rounded-xl flex items-center gap-3 text-sm font-bold shadow-md">
                        <i data-lucide="wind" class="w-6 h-6 shrink-0"></i>
                        <span>${label}: rachas máx. de <b>${maxWind.toFixed(0)} km/h</b>.</span>
                    </div>`;
            }

            // Alerta de Lluvia (Azul Claro > 40% | Azul Oscuro/Índigo > 80%)
            if (maxPrecip >= 40) {
                hasAlerts = true;
                const isDanger = maxPrecip >= 80;
                const color = isDanger ? 'bg-indigo-900/30 border-indigo-700/50 text-indigo-400' : 'bg-blue-900/30 border-blue-700/50 text-blue-400';
                const label = isDanger ? 'Lluvia Intensa Segura' : 'Posible Lluvia';
                alertsContainer.innerHTML += `
                    <div class="${color} border p-3 rounded-xl flex items-center gap-3 text-sm font-bold shadow-md">
                        <i data-lucide="cloud-rain" class="w-6 h-6 shrink-0"></i>
                        <span>${label}: <b>${maxPrecip}%</b> de probabilidad.</span>
                    </div>`;
            }

            // Alerta UV (Amarillo >= 3 | Rojo >= 8)
            if (maxUV >= 3) {
                hasAlerts = true;
                const isDanger = maxUV >= 8;
                const color = isDanger ? 'bg-red-900/30 border-red-700/50 text-red-400' : 'bg-yellow-900/30 border-yellow-700/50 text-yellow-400';
                const label = isDanger ? 'UV Extremo' : 'UV Moderado/Alto';
                alertsContainer.innerHTML += `
                    <div class="${color} border p-3 rounded-xl flex items-center gap-3 text-sm font-bold shadow-md">
                        <i data-lucide="sun" class="w-6 h-6 shrink-0"></i>
                        <span>${label}: Índice <b>${maxUV.toFixed(1)}</b>.</span>
                    </div>`;
            }

            // Alerta Polen (Fucsia > 50 | Rojo oscuro > 100)
            if (maxPollen >= 50) {
                hasAlerts = true;
                const isDanger = maxPollen >= 100;
                const color = isDanger ? 'bg-rose-900/30 border-rose-700/50 text-rose-400' : 'bg-fuchsia-900/30 border-fuchsia-700/50 text-fuchsia-400';
                const label = isDanger ? 'Polen Extremo' : 'Polen Moderado';
                alertsContainer.innerHTML += `
                    <div class="${color} border p-3 rounded-xl flex items-center gap-3 text-sm font-bold shadow-md">
                        <i data-lucide="flower-2" class="w-6 h-6 shrink-0"></i>
                        <span>${label}: <b>${maxPollen.toFixed(0)} granos/m³</b>.</span>
                    </div>`;
            }

            if (hasAlerts) {
                alertsContainer.classList.remove('hidden');
                alertsContainer.classList.add('flex'); // Se comporta como flex en mobile, grid en md/lg (las clases grid-cols- las maneja tailwind)
            }
        }

        function createWeatherMarker(pt, temp, wmoInfo, windDir, windSpeed, precipProb, colorCode, timeStr, uvIndex, pollen) {
            const arrowRotation = windDir + 180; 

            const html = `
                <div class="weather-marker-container">
                    <div class="weather-marker-box" style="border-color: ${colorCode};">
                        <i data-lucide="${wmoInfo.icon}" class="w-4 h-4"></i>
                        <span>${Math.round(temp)}°</span>
                    </div>
                    <div class="weather-marker-pin"></div>
                </div>
            `;

            const icon = L.divIcon({
                className: 'custom-div-icon',
                html: html,
                iconSize: [60, 40],
                iconAnchor: [30, 40]
            });

            const marker = L.marker([pt.lat, pt.lon], { icon: icon }).addTo(weatherMarkersLayer);
            
            // Generadores de mini-alertas dentro del tooltip
            let tooltipAlerts = '';
            if (uvIndex >= 3) tooltipAlerts += `<div class="text-yellow-400 text-[11px] mt-1 flex items-center gap-1"><i data-lucide="sun-dim" class="w-3.5 h-3.5"></i> UV: ${uvIndex.toFixed(1)}</div>`;
            if (windSpeed >= 25) tooltipAlerts += `<div class="text-orange-400 text-[11px] mt-1 flex items-center gap-1"><i data-lucide="wind" class="w-3.5 h-3.5"></i> Viento Fuerte</div>`;
            if (precipProb >= 40) tooltipAlerts += `<div class="text-blue-400 text-[11px] mt-1 flex items-center gap-1"><i data-lucide="droplet" class="w-3.5 h-3.5"></i> Prob. Lluvia Alta</div>`;
            if (pollen >= 50) tooltipAlerts += `<div class="text-fuchsia-400 text-[11px] mt-1 flex items-center gap-1"><i data-lucide="flower-2" class="w-3.5 h-3.5"></i> Polen Moderado/Alto</div>`;

            if (tooltipAlerts !== '') {
                tooltipAlerts = `<div class="border-t border-sky-800/50 pt-1.5 mt-1.5 font-semibold">${tooltipAlerts}</div>`;
            }

            const tooltipHtml = `
                <div class="flex flex-col gap-1">
                    <div class="border-b border-sky-800 pb-1 mb-1 font-bold text-sky-400">
                        Km ${pt.dist.toFixed(1)} <span class="text-gray-400 font-normal">| ${timeStr}</span>
                    </div>
                    <div class="flex items-center gap-2"><i data-lucide="${wmoInfo.icon}" class="w-4 h-4"></i> ${wmoInfo.desc}</div>
                    <div class="flex items-center gap-2"><i data-lucide="thermometer" class="w-4 h-4 text-orange-400"></i> ${temp.toFixed(1)} °C</div>
                    <div class="flex items-center gap-2"><i data-lucide="cloud-rain" class="w-4 h-4 text-blue-400"></i> ${precipProb}% Prob. Lluvia</div>
                    <div class="flex items-center gap-2"><i data-lucide="navigation" class="w-4 h-4 text-gray-400" style="transform: rotate(${arrowRotation}deg)"></i> ${windSpeed.toFixed(1)} km/h</div>
                    ${tooltipAlerts}
                </div>
            `;
            
            marker.bindTooltip(tooltipHtml, { permanent: false, direction: 'top', className: 'weather-tooltip', offset: [0, -10] });
        }

        function addTableRow(dist, timeStr, wmoInfo, temp, windSpeed, windDir, precipProb, colorCode, uvIndex, pollen) {
            const arrowRotation = windDir + 180;
            
            // Colores Dinámicos Tabla
            const rainColor = precipProb >= 40 ? 'text-blue-400 font-bold' : (precipProb > 20 ? 'text-blue-200' : 'text-gray-400');
            const windColor = windSpeed >= 40 ? 'text-red-400 font-bold' : (windSpeed >= 25 ? 'text-orange-400 font-bold' : 'text-gray-300');
            
            let uvColorStr = 'text-green-400';
            if (uvIndex >= 8) uvColorStr = 'text-red-500 font-bold';
            else if (uvIndex >= 6) uvColorStr = 'text-orange-500 font-bold';
            else if (uvIndex >= 3) uvColorStr = 'text-yellow-400 font-bold';

            let pollenColor = 'text-green-400';
            if (pollen >= 100) pollenColor = 'text-red-500 font-bold';
            else if (pollen >= 50) pollenColor = 'text-fuchsia-400 font-bold';

            const row = document.createElement('tr');
            row.className = "hover:bg-gray-800 transition-colors";
            row.innerHTML = `
                <td class="py-3 px-2 font-bold text-sky-400">${dist.toFixed(1)}</td>
                <td class="py-3 px-2 text-gray-200 font-semibold">${timeStr}</td>
                <td class="py-3 px-2">
                    <div class="flex items-center justify-center gap-2" title="${wmoInfo.desc}">
                        <i data-lucide="${wmoInfo.icon}" class="w-5 h-5 text-gray-300"></i>
                    </div>
                </td>
                <td class="py-3 px-2 text-center">
                    <span class="px-2 py-1 rounded text-xs font-bold text-gray-900 shadow-sm" style="background-color: ${colorCode}">
                        ${temp.toFixed(1)} °C
                    </span>
                </td>
                <td class="py-3 px-2 text-center">
                    <div class="flex items-center justify-center gap-1.5 ${windColor}" title="Viento desde ${windDir}°">
                        <i data-lucide="navigation" class="w-3.5 h-3.5" style="transform: rotate(${arrowRotation}deg)"></i>
                        ${windSpeed.toFixed(1)}
                    </div>
                </td>
                <td class="py-3 px-2 text-center ${rainColor}">
                    ${precipProb}%
                </td>
                <td class="py-3 px-2 text-center ${uvColorStr}" title="Índice UV">
                    ${uvIndex.toFixed(1)}
                </td>
                <td class="py-3 px-2 text-center ${pollenColor}" title="Suma total de granos/m³">
                    ${pollen.toFixed(0)}
                </td>
            `;
            tableBody.appendChild(row);
        }

        function getTempColor(temp) {
            if (temp <= 0) return '#38bdf8'; // Sky 400
            if (temp < 10) return '#10b981'; // Emerald 500
            if (temp < 25) return '#facc15'; // Yellow 400
            if (temp < 32) return '#f97316'; // Orange 500
            return '#ef4444'; // Red 500
        }

        function getWMOInfo(code) {
            switch(code) {
                case 0: return { icon: 'sun', desc: 'Despejado' };
                case 1: return { icon: 'cloud-sun', desc: 'Mayormente despejado' };
                case 2: return { icon: 'cloud-sun', desc: 'Parcialmente nublado' };
                case 3: return { icon: 'cloud', desc: 'Nublado' };
                case 45: 
                case 48: return { icon: 'cloud-fog', desc: 'Niebla' };
                case 51: case 53: case 55: return { icon: 'cloud-drizzle', desc: 'Llovizna' };
                case 56: case 57: return { icon: 'cloud-snow', desc: 'Llovizna helada' };
                case 61: return { icon: 'cloud-rain', desc: 'Lluvia leve' };
                case 63: return { icon: 'cloud-rain', desc: 'Lluvia moderada' };
                case 65: return { icon: 'cloud-rain', desc: 'Lluvia fuerte' };
                case 66: case 67: return { icon: 'cloud-snow', desc: 'Lluvia helada' };
                case 71: return { icon: 'snowflake', desc: 'Nieve leve' };
                case 73: return { icon: 'snowflake', desc: 'Nieve moderada' };
                case 75: return { icon: 'snowflake', desc: 'Nieve fuerte' };
                case 77: return { icon: 'snowflake', desc: 'Granizo leve' };
                case 80: case 81: case 82: return { icon: 'cloud-rain', desc: 'Chubascos' };
                case 85: case 86: return { icon: 'snowflake', desc: 'Chubascos de nieve' };
                case 95: return { icon: 'cloud-lightning', desc: 'Tormenta eléctrica' };
                case 96: case 99: return { icon: 'cloud-lightning', desc: 'Tormenta con granizo' };
                default: return { icon: 'cloud', desc: 'Desconocido' };
            }
        }

        function parseGPX(gpxText, filename) {
            const parser = new DOMParser();
            const xml = parser.parseFromString(gpxText, "text/xml");
            const trkpts = xml.getElementsByTagName("trkpt");
            const rtepts = xml.getElementsByTagName("rtept");
            
            const pointsXml = trkpts.length > 0 ? trkpts : rtepts;
            const points = [];

            for (let pt of pointsXml) {
                const lat = parseFloat(pt.getAttribute("lat"));
                const lon = parseFloat(pt.getAttribute("lon"));
                const timeNode = pt.getElementsByTagName("time")[0];
                const time = timeNode ? new Date(timeNode.textContent).getTime() : null;

                if (lat && lon) points.push({ lat, lon, time });
            }
            return { name: filename.replace('.gpx', ''), points: points };
        }

        function haversine(pt1, pt2) {
            const R = 6371; 
            const dLat = (pt2.lat - pt1.lat) * Math.PI / 180;
            const dLon = (pt2.lon - pt1.lon) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(pt1.lat * Math.PI / 180) * Math.cos(pt2.lat * Math.PI / 180) *
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        }