lucide.createIcons();

        // Configuración Global Dark Mode de Chart.js
        Chart.defaults.color = '#9ca3af'; 
        Chart.defaults.scale.grid.color = '#374151'; 

        Chart.Tooltip.positioners.topAlign = function(elements, eventPosition) {
            if (!elements.length) return false;
            
            const chart = this.chart;
            const xPos = elements[0].element.x;
            const tooltipWidth = this.width || 130;
            
            const targetX = Math.max(chart.chartArea.left, xPos - tooltipWidth);

            return {
                x: targetX,
                y: chart.chartArea.top
            };
        };

        const verticalCrosshairPlugin = {
            id: 'verticalCrosshair',
            afterDraw: (chart) => {
                if (chart.tooltip?._active && chart.tooltip._active.length) {
                    const activePoint = chart.tooltip._active[0];
                    const ctx = chart.ctx;
                    const x = activePoint.element.x;
                    const topY = chart.chartArea.top;
                    const bottomY = chart.chartArea.bottom;

                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(x, topY);
                    ctx.lineTo(x, bottomY);
                    ctx.lineWidth = 1.5;
                    ctx.strokeStyle = 'rgba(20, 184, 166, 0.6)';
                    ctx.setLineDash([4, 4]);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        };

        let map;
        let mapLayerGroup;
        let climbMarkersLayerGroup = null;
        let hoverMarker = null;
        let chartElevation, chartSpeed, chartHR, chartTemp, chartCad, chartPower;
        let modalChartInstance = null; 
        let chartPowerCurveInstance = null;
        let xAxisMode = 'distance'; 
        let mergedTrack = []; 
        let rawTracks = [];
        let currentChartData = {}; 
        let hasRecalculated = false; 
        let climbsDetected = [];
        
        let trimStartIdx = 0;
        let trimEndIdx = 0;

        // Variables Zonas HR
        let manualHrZones = false;
        let hrZones = { z2: 111, z3: 130, z4: 148, z5: 167 }; // Defaults si no hay datos
        let hrChartMode = 'solid';

        // Variables de Simulación
        let simInterval = null;
        let isSimulating = false;
        let simCurrentIndex = 0;
        let simFollowCamera = true;

        const chartColors = {
            ele: 'rgb(20, 184, 166)',
            eleBg: 'rgba(20, 184, 166, 0.2)',
            speed: 'rgb(56, 189, 248)',
            speedBg: 'rgba(56, 189, 248, 0.2)',
            hr: 'rgb(244, 63, 94)',
            hrBg: 'rgba(244, 63, 94, 0.2)',
            temp: 'rgb(249, 115, 22)',
            tempBg: 'rgba(249, 115, 22, 0.2)',
            cad: 'rgb(163, 230, 53)',
            cadBg: 'rgba(163, 230, 53, 0.2)',
            power: 'rgb(234, 179, 8)',
            powerBg: 'rgba(234, 179, 8, 0.2)'
        };

        const climbIcon = L.divIcon({
            className: 'custom-div-icon climb-marker',
            html: `<div style="display:flex; flex-direction:column; align-items:center; transform: translateY(-20px);">
                     <div style="background-color:#dc2626; width:26px; height:26px; border-radius:50%; border:2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.6); display:flex; justify-content:center; align-items:center; z-index:2;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
                     </div>
                     <div style="width:3px; height:16px; background-color:#dc2626; z-index:1; border-left:1px solid white; border-right:1px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.4);"></div>
                   </div>`,
            iconSize: [26, 46],
            iconAnchor: [13, 46]
        });

        const dropzone = document.getElementById('dropzone');
        const fileInput = document.getElementById('fileInput');
        const dashboard = document.getElementById('dashboard');
        const btnXDist = document.getElementById('btnXDist');
        const btnXTime = document.getElementById('btnXTime');
        const btnRecalculate = document.getElementById('btnRecalculate');
        const btnDownloadGPX = document.getElementById('btnDownloadGPX');
        const inputRiderWeight = document.getElementById('inputRiderWeight');
        const inputRiderHeight = document.getElementById('inputRiderHeight');
        const inputBikeWeight = document.getElementById('inputBikeWeight');
        const inputBikeType = document.getElementById('inputBikeType');
        const inputDeviceType = document.getElementById('inputDeviceType');

        const rangeStart = document.getElementById('rangeStart');
        const rangeEnd = document.getElementById('rangeEnd');
        const mapColorMode = document.getElementById('mapColorMode');

        // Controles de configuración Zonas HR
        document.getElementById('hrColorMode').addEventListener('change', (e) => {
            hrChartMode = e.target.value;
            renderCharts();
        });

        const hrModal = document.getElementById('hrSettingsModal');
        const hrModalContent = document.getElementById('hrSettingsModalContent');

        document.getElementById('btnOpenHrSettings').addEventListener('click', () => {
            hrModal.classList.remove('hidden');
            document.getElementById('inputZ2').value = hrZones.z2;
            document.getElementById('inputZ3').value = hrZones.z3;
            document.getElementById('inputZ4').value = hrZones.z4;
            document.getElementById('inputZ5').value = hrZones.z5;
            
            setTimeout(() => {
                hrModal.classList.remove('opacity-0');
                hrModalContent.classList.remove('scale-95');
            }, 10);
        });

        document.getElementById('btnCloseHrSettings').addEventListener('click', () => {
            hrModal.classList.add('opacity-0');
            hrModalContent.classList.add('scale-95');
            setTimeout(() => {
                hrModal.classList.add('hidden');
            }, 300);
        });

        document.getElementById('btnCalcAge').addEventListener('click', () => {
            const age = parseInt(document.getElementById('inputAge').value);
            if (!age || age <= 10 || age > 100) return; // Ignorar si no es una edad válida
            
            const maxHr = Math.round(220 - age); // Fórmula clásica para FC Máx.
            
            // Calculamos: Z2(60%), Z3(70%), Z4(80%), Z5(90%)
            document.getElementById('inputZ2').value = Math.round(maxHr * 0.60);
            document.getElementById('inputZ3').value = Math.round(maxHr * 0.70);
            document.getElementById('inputZ4').value = Math.round(maxHr * 0.80);
            document.getElementById('inputZ5').value = Math.round(maxHr * 0.90);
        });

        document.getElementById('btnSaveHrSettings').addEventListener('click', () => {
            hrZones.z2 = parseInt(document.getElementById('inputZ2').value) || 111;
            hrZones.z3 = parseInt(document.getElementById('inputZ3').value) || 130;
            hrZones.z4 = parseInt(document.getElementById('inputZ4').value) || 148;
            hrZones.z5 = parseInt(document.getElementById('inputZ5').value) || 167;
            manualHrZones = true;

            hrModal.classList.add('opacity-0');
            hrModalContent.classList.add('scale-95');
            setTimeout(() => {
                hrModal.classList.add('hidden');
                updateDashboardCore(); // Refresca estadísticas y repinta gráficas
            }, 300);
        });


        // Lógica del Paseo Virtual
        document.getElementById('btnSimPlay').addEventListener('click', () => {
            if (isSimulating) pauseSimulation();
            else startSimulation();
        });
        document.getElementById('btnSimStop').addEventListener('click', stopSimulation);
        document.getElementById('btnSimFollow').addEventListener('click', (e) => {
            simFollowCamera = !simFollowCamera;
            const btn = e.currentTarget;
            if (simFollowCamera) {
                btn.classList.add('text-teal-400', 'bg-gray-800');
                btn.classList.remove('text-gray-500', 'bg-transparent');
            } else {
                btn.classList.remove('text-teal-400', 'bg-gray-800');
                btn.classList.add('text-gray-500', 'bg-transparent');
            }
        });

        function startSimulation() {
            let track = getWorkingTrack();
            if (!track.length) return;
            if (simCurrentIndex >= track.length - 1) simCurrentIndex = 0;
            isSimulating = true;
            document.getElementById('btnSimPlay').innerHTML = '<i data-lucide="pause" class="w-6 h-6 fill-current"></i>';
            document.getElementById('btnSimPlay').classList.replace('text-teal-400', 'text-yellow-400');
            lucide.createIcons();

            let lastRealTime = performance.now();
            let currentSimTime = track[simCurrentIndex].time;

            simInterval = setInterval(() => {
                let now = performance.now();
                let dtReal = now - lastRealTime;
                lastRealTime = now;
                let currentSpeed = parseInt(document.getElementById('simSpeed').value);
                currentSimTime += dtReal * currentSpeed;

                while (simCurrentIndex < track.length - 1 && track[simCurrentIndex + 1].time <= currentSimTime) {
                    simCurrentIndex++;
                }

                if (simCurrentIndex >= track.length - 1) {
                    stopSimulation();
                    simCurrentIndex = track.length - 1;
                }
                updateSimulationUI();
            }, 50);
        }

        function pauseSimulation() {
            isSimulating = false;
            clearInterval(simInterval);
            document.getElementById('btnSimPlay').innerHTML = '<i data-lucide="play" class="w-6 h-6 fill-current"></i>';
            document.getElementById('btnSimPlay').classList.replace('text-yellow-400', 'text-teal-400');
            lucide.createIcons();
        }

        function stopSimulation() {
            pauseSimulation();
            simCurrentIndex = 0;
            updateSimulationUI();
        }

        function updateSimulationUI() {
            let track = getWorkingTrack();
            if (!track || !track[simCurrentIndex]) return;

            syncHighlight(simCurrentIndex, 'sim', true);

            if (simFollowCamera && map && track[simCurrentIndex].lat) {
                const pt = track[simCurrentIndex];
                const bounds = map.getBounds();
                const pad = 0.25; 
                const latPad = (bounds.getNorth() - bounds.getSouth()) * pad;
                const lngPad = (bounds.getEast() - bounds.getWest()) * pad;
                
                const innerBounds = L.latLngBounds(
                    [bounds.getSouth() + latPad, bounds.getWest() + lngPad],
                    [bounds.getNorth() - latPad, bounds.getEast() - lngPad]
                );

                if (!innerBounds.contains([pt.lat, pt.lon])) {
                    map.panTo([pt.lat, pt.lon], { animate: true, duration: 0.5 });
                }
            }

            let activeSeconds = (track[simCurrentIndex].time - track[0].time) / 1000;
            const h = Math.floor(activeSeconds / 3600).toString().padStart(2, '0');
            const m = Math.floor((activeSeconds % 3600) / 60).toString().padStart(2, '0');
            const s = Math.floor(activeSeconds % 60).toString().padStart(2, '0');
            document.getElementById('simTimeDisplay').innerText = `${h}:${m}:${s}`;
        }

        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) handleFiles(e.target.files);
        });

        btnXDist.addEventListener('click', () => {
            xAxisMode = 'distance';
            btnXDist.classList.replace('bg-gray-800', 'bg-teal-600');
            btnXDist.classList.replace('text-gray-300', 'text-white');
            btnXDist.classList.replace('border-gray-700', 'border-teal-500');
            btnXTime.classList.replace('bg-teal-600', 'bg-gray-800');
            btnXTime.classList.replace('text-white', 'text-gray-300');
            btnXTime.classList.replace('border-teal-500', 'border-gray-700');
            renderCharts();
        });
        btnXTime.addEventListener('click', () => {
            xAxisMode = 'time';
            btnXTime.classList.replace('bg-gray-800', 'bg-teal-600');
            btnXTime.classList.replace('text-gray-300', 'text-white');
            btnXTime.classList.replace('border-gray-700', 'border-teal-500');
            btnXDist.classList.replace('bg-teal-600', 'bg-gray-800');
            btnXDist.classList.replace('text-white', 'text-gray-300');
            btnXDist.classList.replace('border-teal-500', 'border-gray-700');
            renderCharts();
        });

        rangeStart.addEventListener('input', (e) => {
            let start = parseInt(e.target.value);
            let end = parseInt(rangeEnd.value);
            if (start >= end) { start = end - 1; e.target.value = start; }
            trimStartIdx = start;
            stopSimulation(); 
            updateDashboardCore();
        });
        
        rangeEnd.addEventListener('input', (e) => {
            let end = parseInt(e.target.value);
            let start = parseInt(rangeStart.value);
            if (end <= start) { end = start + 1; e.target.value = end; }
            trimEndIdx = end;
            stopSimulation(); 
            updateDashboardCore();
        });

        document.getElementById('btnResetSegment').addEventListener('click', () => {
            if(mergedTrack.length > 0) {
                trimStartIdx = 0;
                trimEndIdx = mergedTrack.length - 1;
                rangeStart.value = trimStartIdx;
                rangeEnd.value = trimEndIdx;
                stopSimulation();
                updateDashboardCore();
                
                const list = document.getElementById('climbsList');
                if (list) {
                    Array.from(list.children).forEach(btn => {
                        btn.classList.add('bg-rose-900/80', 'border-rose-700', 'text-rose-200', 'z-10');
                        btn.classList.remove('bg-rose-500', 'border-white', 'text-white', 'z-20', 'scale-110', 'ring-2', 'ring-rose-400', 'ring-offset-2', 'ring-offset-gray-900');
                    });
                }
            }
        });

        mapColorMode.addEventListener('change', () => { initOrUpdateMap(); });

        btnRecalculate.addEventListener('click', () => {
            hasRecalculated = true;
            document.getElementById('powerOverlay').classList.add('opacity-0', 'pointer-events-none');
            document.getElementById('powerStatOverlay').classList.add('opacity-0', 'pointer-events-none');
            document.getElementById('powerStatContent').classList.remove('blur-sm', 'select-none');
            document.getElementById('curveOverlay').classList.add('opacity-0', 'pointer-events-none');
            
            const btnDownload = document.getElementById('btnDownloadGPX');
            btnDownload.disabled = false;
            btnDownload.title = "Descarga tu entrenamiento con la potencia virtual calculada";
            btnDownload.className = "w-full mt-6 py-2.5 bg-teal-600 text-white rounded-lg font-bold shadow-md transition-colors hover:bg-teal-500 flex items-center justify-center gap-2 border border-teal-500";
            btnDownload.innerHTML = '<i data-lucide="download" class="w-4 h-4"></i> Descargar GPX (Potencia Virtual)';
            lucide.createIcons();
            
            if (rawTracks.length > 0) {
                fuseTracks();
                analyzeClimbs();
                renderClimbsUI();
                trimStartIdx = 0;
                trimEndIdx = mergedTrack.length - 1;
                setupSegmentSliders();
                stopSimulation();
                updateDashboardCore();
            }
        });

        btnDownloadGPX.addEventListener('click', downloadGPXFile);

        async function handleFiles(files) {
            rawTracks = [];
            for (let file of files) {
                const text = await file.text();
                const track = parseGPX(text, file.name);
                if (track.points.length > 0) {
                    rawTracks.push(track);
                }
            }

            if (rawTracks.length > 0) {
                dashboard.classList.remove('hidden');
                document.getElementById('welcome-screen').classList.add('hidden');
                document.getElementById('segmentAnalyzer').classList.remove('hidden');
                document.getElementById('virtualTourControls').classList.remove('hidden');
                
                fuseTracks();
                analyzeClimbs();
                renderClimbsUI();
                
                trimStartIdx = 0;
                trimEndIdx = mergedTrack.length - 1;
                setupSegmentSliders();
                stopSimulation();
                
                const trackList = document.getElementById('trackList');
                trackList.innerHTML = '';
                rawTracks.forEach(track => {
                    const isMaster = track.isMaster 
                        ? '<span class="ml-auto text-xs font-bold bg-teal-900 text-teal-400 border border-teal-800 px-2 py-1 rounded-md">Pista Principal</span>' 
                        : '<span class="ml-auto text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700 px-2 py-1 rounded-md">Datos Extra</span>';
                    
                    trackList.innerHTML += `
                        <li class="flex items-center gap-2 border-b border-gray-700/50 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
                            <i data-lucide="file-check" class="w-4 h-4 text-emerald-500 shrink-0"></i> 
                            <span class="truncate max-w-[180px] font-medium text-gray-300" title="${track.name}">${track.name}</span> 
                            <span class="text-xs text-gray-500">(${track.points.length} pts)</span>
                            ${isMaster}
                        </li>`;
                });
                lucide.createIcons();

                updateDashboardCore();
            } else {
                alert("No se pudieron leer datos válidos de los archivos GPX.");
            }
        }

        function setupSegmentSliders() {
            if(!mergedTrack.length) return;
            rangeStart.max = mergedTrack.length - 1;
            rangeEnd.max = mergedTrack.length - 1;
            rangeStart.value = trimStartIdx;
            rangeEnd.value = trimEndIdx;
        }

        function getWorkingTrack() {
            if(!mergedTrack.length) return [];
            return mergedTrack.slice(trimStartIdx, trimEndIdx + 1);
        }

        function updateDashboardCore() {
            updateStats();
            initOrUpdateMap();
            renderCharts();
        }

        function analyzeClimbs() {
            if(!mergedTrack || mergedTrack.length < 10) {
                climbsDetected = [];
                return;
            }
            let gradients = new Array(mergedTrack.length).fill(0);
            let windowDist = 0.1; 

            for (let i = 0; i < mergedTrack.length; i++) {
                if (mergedTrack[i].baseEle === null) continue;
                let currentDist = mergedTrack[i].dist;
                let startIdx = i;
                let endIdx = i;
                while (startIdx > 0 && (currentDist - mergedTrack[startIdx].dist) < windowDist / 2) startIdx--;
                while (endIdx < mergedTrack.length - 1 && (mergedTrack[endIdx].dist - currentDist) < windowDist / 2) endIdx++;
                let distDiff = mergedTrack[endIdx].dist - mergedTrack[startIdx].dist;
                let eleDiff = mergedTrack[endIdx].baseEle - mergedTrack[startIdx].baseEle;
                if (distDiff > 0.01) gradients[i] = (eleDiff / (distDiff * 1000)) * 100;
            }

            let currentClimb = null;
            climbsDetected = [];
            let flatDistance = 0;

            for (let i = 1; i < mergedTrack.length; i++) {
                if (mergedTrack[i].baseEle === null || mergedTrack[i-1].baseEle === null) continue;
                let distDiff = mergedTrack[i].dist - mergedTrack[i-1].dist;
                let grade = gradients[i];

                if (distDiff <= 0) continue;

                if (!currentClimb) {
                    if (grade >= 2.0) { 
                        currentClimb = { startIdx: i-1, maxEle: mergedTrack[i].baseEle };
                        flatDistance = 0;
                    }
                } else {
                    if (mergedTrack[i].baseEle > currentClimb.maxEle) currentClimb.maxEle = mergedTrack[i].baseEle;
                    if (grade < 1.0) flatDistance += distDiff * 1000; 
                    else flatDistance = 0;
                    
                    let dropFromPeak = currentClimb.maxEle - mergedTrack[i].baseEle;
                    if (dropFromPeak > 10 || flatDistance > 300) { 
                        let endIdx = i;
                        while(endIdx > currentClimb.startIdx && mergedTrack[endIdx].baseEle < currentClimb.maxEle) endIdx--;
                        finalizeClimb(currentClimb.startIdx, endIdx);
                        currentClimb = null;
                    }
                }
            }

            if (currentClimb) {
                let endIdx = mergedTrack.length - 1;
                while(endIdx > currentClimb.startIdx && mergedTrack[endIdx].baseEle < currentClimb.maxEle) endIdx--;
                finalizeClimb(currentClimb.startIdx, endIdx);
            }

            function finalizeClimb(sIdx, eIdx) {
                let climbDist = mergedTrack[eIdx].dist - mergedTrack[sIdx].dist;
                let climbEle = mergedTrack[eIdx].baseEle - mergedTrack[sIdx].baseEle; 
                if (climbDist <= 0 || isNaN(climbDist) || isNaN(climbEle)) return;
                let avgGrade = (climbEle / (climbDist * 1000)) * 100;
                if (climbDist >= 0.3 && climbEle >= 15 && avgGrade >= 2.0) {
                    climbsDetected.push({ startIdx: sIdx, endIdx: eIdx, distance: climbDist, ascent: climbEle, avgGrade: avgGrade });
                }
            }
        }

        function selectSegment(startIdx, endIdx) {
            trimStartIdx = startIdx;
            trimEndIdx = endIdx;
            rangeStart.value = startIdx;
            rangeEnd.value = endIdx;
            stopSimulation();
            updateDashboardCore();
            
            const list = document.getElementById('climbsList');
            if (list) {
                Array.from(list.children).forEach((btn, idx) => {
                    const c = climbsDetected[idx];
                    if (c && c.startIdx === startIdx && c.endIdx === endIdx) {
                        btn.classList.remove('bg-rose-900/80', 'border-rose-700', 'text-rose-200', 'z-10');
                        btn.classList.add('bg-rose-500', 'border-white', 'text-white', 'z-20', 'scale-110', 'ring-2', 'ring-rose-400', 'ring-offset-2', 'ring-offset-gray-900');
                    } else {
                        btn.classList.add('bg-rose-900/80', 'border-rose-700', 'text-rose-200', 'z-10');
                        btn.classList.remove('bg-rose-500', 'border-white', 'text-white', 'z-20', 'scale-110', 'ring-2', 'ring-rose-400', 'ring-offset-2', 'ring-offset-gray-900');
                    }
                });
            }
            document.getElementById('segmentAnalyzer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        function renderClimbsUI() {
            const container = document.getElementById('climbsListContainer');
            const list = document.getElementById('climbsList');
            if (climbsDetected.length > 0 && mergedTrack.length > 0) {
                container.classList.remove('hidden');
                container.classList.add('flex');
                list.innerHTML = '';
                const totalPoints = mergedTrack.length - 1;
                
                climbsDetected.forEach((climb, index) => {
                    const btn = document.createElement('button');
                    const leftPercent = (climb.startIdx / totalPoints) * 100;
                    btn.className = "climb-btn absolute top-1/2 flex items-center justify-center w-7 h-7 rounded-full bg-rose-900/80 border-2 border-rose-700 text-[10px] font-bold text-rose-200 hover:bg-rose-600 hover:border-rose-400 hover:text-white transition-all shadow-md z-10 hover:z-30 hover:scale-125";
                    btn.style.left = `calc(${leftPercent}% - 14px)`; 
                    btn.style.transform = "translateY(-50%)";
                    btn.innerHTML = `${index + 1}`;
                    btn.title = `⛰️ Ascenso ${index+1}\nDistancia: ${climb.distance.toFixed(1)} km\nDesnivel: +${Math.round(climb.ascent)} m\nPendiente: ${climb.avgGrade.toFixed(1)}%`;
                    btn.onclick = () => selectSegment(climb.startIdx, climb.endIdx);
                    list.appendChild(btn);
                });
                lucide.createIcons();
            } else {
                container.classList.remove('flex');
                container.classList.add('hidden');
            }
        }

        function parseGPX(gpxText, filename) {
            const parser = new DOMParser();
            const xml = parser.parseFromString(gpxText, "text/xml");
            const trkpts = xml.getElementsByTagName("trkpt");
            const points = [];

            let nativeAscent = null;
            let nativeDescent = null;
            const climbNode = xml.getElementsByTagNameNS("*", "cumulativeClimb")[0] || xml.getElementsByTagName("cumulativeClimb")[0];
            if (climbNode) nativeAscent = parseFloat(climbNode.textContent);
            const descNode = xml.getElementsByTagNameNS("*", "cumulativeDecrease")[0] || xml.getElementsByTagName("cumulativeDecrease")[0];
            if (descNode) nativeDescent = parseFloat(descNode.textContent);

            for (let pt of trkpts) {
                const lat = parseFloat(pt.getAttribute("lat"));
                const lon = parseFloat(pt.getAttribute("lon"));
                const eleNode = pt.getElementsByTagName("ele")[0];
                const ele = eleNode ? parseFloat(eleNode.textContent) : null;
                const timeNode = pt.getElementsByTagName("time")[0];
                const time = timeNode ? new Date(timeNode.textContent).getTime() : null;

                let hr = null;
                const hrNode = pt.getElementsByTagNameNS("*", "hr")[0];
                if (hrNode) hr = parseInt(hrNode.textContent);

                let temp = null;
                const tempNode = pt.getElementsByTagNameNS("*", "atemp")[0];
                if (tempNode) temp = parseFloat(tempNode.textContent);

                let cad = null;
                const cadNode = pt.getElementsByTagNameNS("*", "cad")[0];
                if (cadNode) cad = parseInt(cadNode.textContent);

                if (lat && lon && time) {
                    points.push({ lat, lon, ele, time, hr, temp, cad });
                }
            }
            return { name: filename, points: points.sort((a,b) => a.time - b.time), nativeAscent, nativeDescent };
        }

        function fuseTracks() {
            let tempTrack = [];
            let startTime = 0;

            if (rawTracks.length > 0) {
                let masterTrack = rawTracks[0];
                for (let i = 1; i < rawTracks.length; i++) {
                    if (rawTracks[i].points.filter(p => p.lat).length > masterTrack.points.filter(p => p.lat).length) {
                        masterTrack = rawTracks[i];
                    }
                }
                rawTracks.forEach(t => t.isMaster = (t === masterTrack));
                startTime = masterTrack.points.length > 0 ? masterTrack.points[0].time : 0;
                rawTracks.forEach(t => t._lastIndex = 0);

                masterTrack.points.forEach(pt => {
                    let newPt = {
                        time: pt.time, relativeTimeMin: (pt.time - startTime) / 60000,
                        lat: pt.lat, lon: pt.lon, ele: pt.ele, hr: pt.hr, temp: pt.temp, cad: pt.cad
                    };

                    if (rawTracks.length > 1) {
                        rawTracks.forEach(track => {
                            if (track !== masterTrack) {
                                while (track._lastIndex < track.points.length && track.points[track._lastIndex].time < pt.time - 2000) {
                                    track._lastIndex++;
                                }
                                let searchIdx = track._lastIndex;
                                let match = null;
                                while (searchIdx < track.points.length && track.points[searchIdx].time <= pt.time + 2000) {
                                    if (Math.abs(track.points[searchIdx].time - pt.time) <= 2000) {
                                        match = track.points[searchIdx];
                                        break; 
                                    }
                                    searchIdx++;
                                }
                                if (match) {
                                    if (newPt.hr === null && match.hr !== null) newPt.hr = match.hr;
                                    if (newPt.cad === null && match.cad !== null) newPt.cad = match.cad;
                                    if (newPt.temp === null && match.temp !== null) newPt.temp = match.temp;
                                    if (newPt.lat === null && match.lat !== null) {
                                        newPt.lat = match.lat; newPt.lon = match.lon; newPt.ele = match.ele;
                                    }
                                }
                            }
                        });
                    }
                    const lastSaved = tempTrack[tempTrack.length - 1];
                    if (!lastSaved || (newPt.time - lastSaved.time) >= 1000) tempTrack.push(newPt);
                });
            }

            for (let i = 0; i < tempTrack.length; i++) {
                let pt = tempTrack[i];
                let latSum = 0, lonSum = 0, eleSumExtremo = 0, eleSumBase = 0;
                let count = 0, eleCountExtremo = 0, eleCountBase = 0;
                for (let j = Math.max(0, i - 3); j <= Math.min(tempTrack.length - 1, i + 3); j++) {
                    if (tempTrack[j].lat && tempTrack[j].lon) { latSum += tempTrack[j].lat; lonSum += tempTrack[j].lon; count++; }
                }
                for (let j = Math.max(0, i - 8); j <= Math.min(tempTrack.length - 1, i + 8); j++) {
                    if (tempTrack[j].ele !== null) { eleSumExtremo += tempTrack[j].ele; eleCountExtremo++; }
                }
                for (let j = Math.max(0, i - 2); j <= Math.min(tempTrack.length - 1, i + 2); j++) {
                    if (tempTrack[j].ele !== null) { eleSumBase += tempTrack[j].ele; eleCountBase++; }
                }
                pt.smoothLat = count > 0 ? latSum / count : pt.lat;
                pt.smoothLon = count > 0 ? lonSum / count : pt.lon;
                pt.smoothEle = eleCountExtremo > 0 ? eleSumExtremo / eleCountExtremo : pt.ele;
                pt.baseEle = eleCountBase > 0 ? eleSumBase / eleCountBase : pt.ele; 
            }

            let mRider = parseFloat(inputRiderWeight.value) || 105;
            let mBike = parseFloat(inputBikeWeight.value) || 15;
            let totalMass = mRider + mBike;
            let rho = 1.225; let gravity = 9.81;
            let bikeType = inputBikeType ? inputBikeType.value : 'mtb';
            let deviceType = inputDeviceType ? inputDeviceType.value : 'computer';

            let cda = 0.32; let crr = 0.004; 
            if (bikeType === 'mtb') { cda = 0.36; crr = 0.009; } 
            else if (bikeType === 'gravel') { cda = 0.34; crr = 0.0065; }

            let maxAcceleration = deviceType === 'watch' ? 0.35 : 0.70;
            mergedTrack = [];
            let totalDist = 0;
            
            if (tempTrack.length > 0) {
                let firstPt = tempTrack[0];
                firstPt.dist = 0; firstPt.speed = 0; firstPt.power = 0;
                firstPt.isMoving = false; firstPt.deltaT = 0;
                mergedTrack.push(firstPt);
            }

            let rawPowers = []; 

            for (let i = 1; i < tempTrack.length; i++) {
                let pt = tempTrack[i]; let prevPt = tempTrack[i-1];
                let deltaT = (pt.time - prevPt.time) / 1000;
                if (deltaT <= 0) continue;

                let distDelta = 0;
                if (pt.smoothLat && pt.smoothLon && prevPt.smoothLat && prevPt.smoothLon) {
                    distDelta = haversine(prevPt.smoothLat, prevPt.smoothLon, pt.smoothLat, pt.smoothLon);
                }
                
                let instSpeedKmh = distDelta / (deltaT / 3600);
                let isMoving = true;

                if (deltaT > 5) {
                    if (instSpeedKmh < 4.0) isMoving = false; 
                } else {
                    let lookBackIndex = i;
                    while (lookBackIndex > 0 && ((pt.time - tempTrack[lookBackIndex].time) / 1000) < 15) lookBackIndex--;
                    let realTimeWindow = (pt.time - tempTrack[lookBackIndex].time) / 1000;
                    if (realTimeWindow > 3) {
                        let pt1 = tempTrack[lookBackIndex];
                        let netDist = haversine(pt1.smoothLat, pt1.smoothLon, pt.smoothLat, pt.smoothLon);
                        let netSpeedKmh = netDist / (realTimeWindow / 3600);
                        if (netSpeedKmh < 2.5) isMoving = false; 
                    } else {
                        if (instSpeedKmh < 2.5) isMoving = false;
                    }
                }

                let finalSpeed = 0; let instPower = 0;
                if (isMoving) {
                    totalDist += distDelta; 
                    let currentRawSpeed = Math.min(instSpeedKmh, 80); 
                    let prevSpeed = mergedTrack[i-1].speed || 0;
                    finalSpeed = (currentRawSpeed * 0.3) + (prevSpeed * 0.7); 

                    let ptA = tempTrack[Math.max(0, i - 5)]; let ptB = tempTrack[Math.min(tempTrack.length - 1, i + 5)];
                    let distForGrade = haversine(ptA.smoothLat, ptA.smoothLon, ptB.smoothLat, ptB.smoothLon);
                    let grade = 0;
                    if (distForGrade > 0.005 && ptB.smoothEle !== null && ptA.smoothEle !== null) {
                        grade = (ptB.smoothEle - ptA.smoothEle) / (distForGrade * 1000); 
                    }
                    let maxGrade = deviceType === 'watch' ? 0.12 : 0.15;
                    grade = Math.max(-maxGrade, Math.min(maxGrade, grade)); 
                    let v_ms = (finalSpeed / 3.6); 
                    
                    let a_ms2 = 0;
                    if (i > 4) {
                        let pastPt = mergedTrack[i - 4];
                        let dtAcc = (pt.time - pastPt.time) / 1000;
                        if (dtAcc > 0) a_ms2 = (v_ms - (pastPt.speed / 3.6)) / dtAcc;
                    } else {
                        a_ms2 = (v_ms - (prevSpeed / 3.6)) / deltaT;
                    }
                    a_ms2 = Math.max(-maxAcceleration, Math.min(maxAcceleration, a_ms2)); 
                    
                    let P_rodadura = v_ms > 0 ? crr * totalMass * gravity * v_ms : 0;
                    let P_aero = 0.5 * rho * cda * Math.pow(v_ms, 3);
                    let P_gravedad = totalMass * gravity * v_ms * grade;
                    let P_aceleracion = totalMass * v_ms * a_ms2; 
                    let rawTotalPower = (P_rodadura + P_aero + P_gravedad + P_aceleracion) / 0.96; 
                    instPower = rawTotalPower > 0 ? Math.min(rawTotalPower, 1100) : 0; 
                }

                pt.dist = totalDist; pt.speed = finalSpeed; pt.isMoving = isMoving; pt.deltaT = deltaT;
                rawPowers.push(instPower);
                mergedTrack.push(pt);
            }

            for (let i = 1; i < mergedTrack.length; i++) {
                let powSum = 0, count = 0;
                let smoothWindow = deviceType === 'watch' ? 6 : 3;
                for (let j = Math.max(0, i - smoothWindow); j <= Math.min(mergedTrack.length - 2, i + smoothWindow); j++) {
                    powSum += rawPowers[j]; count++;
                }
                mergedTrack[i].power = count > 0 ? powSum / count : rawPowers[i-1];
            }
        }

        function getPeakPower(track, seconds) {
            if (!hasRecalculated || track.length === 0) return '--';
            let maxAvg = 0; let windowSum = 0; let startIdx = 0;
            for (let endIdx = 0; endIdx < track.length; endIdx++) {
                windowSum += track[endIdx].power || 0;
                while (startIdx <= endIdx && ((track[endIdx].time - track[startIdx].time) / 1000) > seconds) {
                    windowSum -= track[startIdx].power || 0;
                    startIdx++;
                }
                let windowDur = (track[endIdx].time - track[startIdx].time) / 1000;
                if (windowDur >= seconds * 0.85) { 
                    let count = endIdx - startIdx + 1;
                    let avg = windowSum / count;
                    if (avg > maxAvg) maxAvg = avg;
                }
            }
            return maxAvg > 0 ? Math.round(maxAvg) : '--';
        }

        function downloadGPXFile() {
            if (!mergedTrack || mergedTrack.length === 0) return;

            let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="GPX Sync &amp; Merge" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata>
    <name>Entrenamiento Fusionado (Potencia Virtual)</name>
    <desc>Generado por GPX Sync &amp; Merge. Los datos de potencia son virtuales/estimados basándose en la física del ciclista y el perfil del terreno.</desc>
  </metadata>
  <trk>
    <name>Track Sincronizado</name>
    <type>cycling</type>
    <trkseg>\n`;

            mergedTrack.forEach(pt => {
                if (pt.lat === null || pt.lon === null) return; 
                gpx += `      <trkpt lat="${pt.lat}" lon="${pt.lon}">\n`;
                if (pt.baseEle !== null && !isNaN(pt.baseEle)) gpx += `        <ele>${pt.baseEle.toFixed(1)}</ele>\n`;
                if (pt.time) gpx += `        <time>${new Date(pt.time).toISOString()}</time>\n`;

                let hasExtensions = false;
                let extStr = `        <extensions>\n`;
                
                if (pt.power !== null && !isNaN(pt.power) && pt.power >= 0) {
                    extStr += `          <power>${Math.round(pt.power)}</power>\n`;
                    hasExtensions = true;
                }

                if ((pt.hr !== null && !isNaN(pt.hr)) || (pt.cad !== null && !isNaN(pt.cad)) || (pt.temp !== null && !isNaN(pt.temp))) {
                    hasExtensions = true;
                    extStr += `          <gpxtpx:TrackPointExtension>\n`;
                    if (pt.hr !== null && !isNaN(pt.hr)) extStr += `            <gpxtpx:hr>${Math.round(pt.hr)}</gpxtpx:hr>\n`;
                    if (pt.cad !== null && !isNaN(pt.cad)) extStr += `            <gpxtpx:cad>${Math.round(pt.cad)}</gpxtpx:cad>\n`;
                    if (pt.temp !== null && !isNaN(pt.temp)) extStr += `            <gpxtpx:atemp>${pt.temp.toFixed(1)}</gpxtpx:atemp>\n`;
                    extStr += `          </gpxtpx:TrackPointExtension>\n`;
                }

                extStr += `        </extensions>\n`;
                if (hasExtensions) gpx += extStr;
                gpx += `      </trkpt>\n`;
            });

            gpx += `    </trkseg>\n  </trk>\n</gpx>`;

            const blob = new Blob([gpx], { type: 'application/gpx+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'track_fusionado_potencia_virtual.gpx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function haversine(lat1, lon1, lat2, lon2) {
            const R = 6371; 
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        }

        function updateStats() {
            let track = getWorkingTrack();
            if(!track.length) return;
            
            const firstPoint = track[0];
            const lastPoint = track[track.length - 1];
            let segmentDistance = lastPoint.dist - firstPoint.dist;
            
            document.getElementById('lblStartKm').innerText = firstPoint.dist.toFixed(1) + ' km';
            document.getElementById('lblEndKm').innerText = lastPoint.dist.toFixed(1) + ' km';
            document.getElementById('lblSegmentDist').innerText = segmentDistance.toFixed(1) + ' km';
            document.getElementById('stat-dist').innerText = segmentDistance.toFixed(2) + ' km';
            
            const totalSeconds = (lastPoint.time - firstPoint.time) / 1000;
            let activeSeconds = 0;
            for (let i = 1; i < track.length; i++) {
                if (track[i].isMoving) activeSeconds += track[i].deltaT;
            }
            if (activeSeconds <= 0) activeSeconds = totalSeconds; 

            const formatTime = (secs) => {
                const h = Math.floor(secs / 3600).toString().padStart(2, '0');
                const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
                const s = Math.floor(secs % 60).toString().padStart(2, '0');
                return `${h}:${m}:${s}`;
            };

            document.getElementById('stat-time-active').innerText = formatTime(activeSeconds);

            const avgSpeed = activeSeconds > 0 ? segmentDistance / (activeSeconds / 3600) : 0;
            document.getElementById('stat-speed').innerText = avgSpeed.toFixed(1) + ' km/h';

            const hrs = track.map(p => p.hr).filter(hr => hr !== null && !isNaN(hr));
            const maxHr = hrs.length > 0 ? Math.max(...hrs) : '--';
            const avgHr = hrs.length > 0 ? Math.round(hrs.reduce((a,b)=>a+b,0) / hrs.length) : null;
            document.getElementById('stat-hr-max').innerText = maxHr;
            document.getElementById('stat-hr-avg').innerText = avgHr !== null ? avgHr : '--';

            const temps = track.map(p => p.temp).filter(t => t !== null && !isNaN(t));
            const minTemp = temps.length > 0 ? Math.min(...temps).toFixed(1) : '--';
            const maxTemp = temps.length > 0 ? Math.max(...temps).toFixed(1) : '--';
            document.getElementById('stat-temp-min').innerText = minTemp;
            document.getElementById('stat-temp-max').innerText = maxTemp;

            const cads = track.map(p => p.cad).filter(c => c !== null && !isNaN(c));
            const avgCad = cads.length > 0 ? Math.round(cads.reduce((a,b)=>a+b,0) / cads.length) : '--';
            document.getElementById('stat-cad-avg').innerText = avgCad !== '--' ? avgCad + ' rpm' : '-- rpm';

            const powers = track.filter(p => p.isMoving).map(p => p.power);
            const avgPower = powers.length > 0 ? (powers.reduce((a,b)=>a+b,0) / powers.length) : null;
            
            let mRider = parseFloat(inputRiderWeight.value) || 105;
            let kcal = 0;
            if (hasRecalculated && avgPower) {
                document.getElementById('stat-power').innerText = Math.round(avgPower) + ' W';
                document.getElementById('stat-wkg').innerText = '(' + (avgPower/mRider).toFixed(1) + ' W/kg)';
                kcal = (avgPower * activeSeconds) / 1000;
            } else {
                document.getElementById('stat-power').innerText = '-- W';
                document.getElementById('stat-wkg').innerText = '(-- W/kg)';
            }

            let totalAscent = 0; let totalDescent = 0;
            const validEles = track.filter(p => p.baseEle !== null && !isNaN(p.baseEle)).map(p => p.baseEle);

            if (validEles.length > 0) {
                let localMin = validEles[0]; let localMax = validEles[0];
                let trend = 0; const ELE_THRESHOLD = 0.3; 

                for (let i = 1; i < validEles.length; i++) {
                    let ele = validEles[i];
                    if (trend >= 0 && ele < localMax - ELE_THRESHOLD) {
                        if (localMax > localMin) totalAscent += (localMax - localMin);
                        trend = -1; localMin = ele; localMax = ele;
                    } else if (trend <= 0 && ele > localMin + ELE_THRESHOLD) {
                        if (localMax > localMin) totalDescent += (localMax - localMin);
                        trend = 1; localMax = ele; localMin = ele;
                    } else {
                        if (ele > localMax) localMax = ele;
                        if (ele < localMin) localMin = ele;
                    }
                }
                if (trend === 1 && localMax > localMin) totalAscent += (localMax - localMin);
                else if (trend === -1 && localMax > localMin) totalDescent += (localMax - localMin);
            }

            if (track.length === mergedTrack.length) {
                let nativeA = null, nativeD = null;
                rawTracks.forEach(t => {
                    if (t.nativeAscent !== null) { nativeA = t.nativeAscent; nativeD = t.nativeDescent; }
                });
                if (nativeA !== null) {
                    totalAscent = nativeA;
                    if (nativeD !== null) totalDescent = nativeD;
                }
            }
            
            document.getElementById('stat-ascent').innerText = '+' + Math.round(totalAscent) + ' m';
            let vam = activeSeconds > 0 ? (totalAscent / activeSeconds) * 3600 : 0;
            document.getElementById('stat-vam').innerText = Math.round(vam) + ' m/h';

            let hardnessScore = 0; let currentSegDist = 0;
            let segmentEleStart = track.length > 0 ? track[0].baseEle : null;
            
            // --- NUEVA LÓGICA DE ZONAS HR ---
            let timeZ1 = 0, timeZ2 = 0, timeZ3 = 0, timeZ4 = 0, timeZ5 = 0;
            
            if (!manualHrZones && maxHr !== '--' && maxHr > 140) {
                hrZones.z2 = Math.round(maxHr * 0.6);
                hrZones.z3 = Math.round(maxHr * 0.7);
                hrZones.z4 = Math.round(maxHr * 0.8);
                hrZones.z5 = Math.round(maxHr * 0.9);
            }
            
            for (let i = 1; i < track.length; i++) {
                let pt = track[i]; let prevPt = track[i-1];
                let distKm = pt.dist - prevPt.dist;
                currentSegDist += distKm;

                if (pt.isMoving && pt.hr) {
                    if (pt.hr >= hrZones.z5) timeZ5 += pt.deltaT;
                    else if (pt.hr >= hrZones.z4) timeZ4 += pt.deltaT;
                    else if (pt.hr >= hrZones.z3) timeZ3 += pt.deltaT;
                    else if (pt.hr >= hrZones.z2) timeZ2 += pt.deltaT;
                    else timeZ1 += pt.deltaT;
                }

                if (currentSegDist >= 0.05 || i === track.length - 1) {
                    let grade = 0;
                    if (pt.baseEle !== null && !isNaN(pt.baseEle) && segmentEleStart !== null && !isNaN(segmentEleStart)) {
                        let eleDiff = pt.baseEle - segmentEleStart;
                        grade = (eleDiff / (currentSegDist * 1000)) * 100;
                    }
                    if (grade >= 15) hardnessScore += currentSegDist * 15;
                    else if (grade >= 10) hardnessScore += currentSegDist * 10;
                    else if (grade >= 5) hardnessScore += currentSegDist * 4.5;
                    else if (grade >= 1) hardnessScore += currentSegDist * 1.5;
                    else hardnessScore += currentSegDist * 0.6;

                    currentSegDist = 0;
                    segmentEleStart = pt.baseEle;
                }
            }
            
            hardnessScore += (totalAscent / 100);
            document.getElementById('stat-hardness').innerText = Math.round(hardnessScore) + ' pts';

            let aerobicTE = 0; let anaerobicTE = 0;
            
            if (maxHr !== '--') {
                document.getElementById('zones-panel').classList.replace('hidden', 'grid');
                let totalZTime = timeZ1 + timeZ2 + timeZ3 + timeZ4 + timeZ5;
                if(totalZTime === 0) totalZTime = 1; 
                
                const zonesHtml = `
                    <div class="flex items-center text-xs gap-3"><div class="w-8 font-semibold text-gray-500">Z5</div><div class="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden" title=">${hrZones.z5} ppm"><div class="bg-rose-500 h-full zone-bar" style="width: ${(timeZ5/totalZTime)*100}%"></div></div><div class="w-10 text-right text-gray-400 font-medium">${Math.round((timeZ5/60))}m</div></div>
                    <div class="flex items-center text-xs gap-3"><div class="w-8 font-semibold text-gray-500">Z4</div><div class="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden" title="${hrZones.z4}-${hrZones.z5-1} ppm"><div class="bg-orange-500 h-full zone-bar" style="width: ${(timeZ4/totalZTime)*100}%"></div></div><div class="w-10 text-right text-gray-400 font-medium">${Math.round((timeZ4/60))}m</div></div>
                    <div class="flex items-center text-xs gap-3"><div class="w-8 font-semibold text-gray-500">Z3</div><div class="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden" title="${hrZones.z3}-${hrZones.z4-1} ppm"><div class="bg-emerald-500 h-full zone-bar" style="width: ${(timeZ3/totalZTime)*100}%"></div></div><div class="w-10 text-right text-gray-400 font-medium">${Math.round((timeZ3/60))}m</div></div>
                    <div class="flex items-center text-xs gap-3"><div class="w-8 font-semibold text-gray-500">Z2</div><div class="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden" title="${hrZones.z2}-${hrZones.z3-1} ppm"><div class="bg-sky-400 h-full zone-bar" style="width: ${(timeZ2/totalZTime)*100}%"></div></div><div class="w-10 text-right text-gray-400 font-medium">${Math.round((timeZ2/60))}m</div></div>
                    <div class="flex items-center text-xs gap-3"><div class="w-8 font-semibold text-gray-500">Z1</div><div class="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden" title="<${hrZones.z2} ppm"><div class="bg-gray-500 h-full zone-bar" style="width: ${(timeZ1/totalZTime)*100}%"></div></div><div class="w-10 text-right text-gray-400 font-medium">${Math.round((timeZ1/60))}m</div></div>
                `;
                document.getElementById('hr-zones-container').innerHTML = zonesHtml;
                
                aerobicTE = ((timeZ1*0.3 + timeZ2*1.0 + timeZ3*2.0 + timeZ4*2.5 + timeZ5*1.0) / 3600) * 1.8;
                anaerobicTE = ((timeZ4*1.0 + timeZ5*2.5) / 1800) * 1.5;
            } else {
                document.getElementById('zones-panel').classList.replace('grid', 'hidden');
                aerobicTE = (activeSeconds / 3600) * (avgSpeed / 20) * 2;
                anaerobicTE = (hardnessScore / 100);
            }
            
            aerobicTE = Math.min(5.0, Math.max(0.0, aerobicTE));
            anaerobicTE = Math.min(5.0, Math.max(0.0, anaerobicTE));
            
            document.getElementById('te-aerobic-val').innerText = aerobicTE.toFixed(1);
            document.getElementById('te-aerobic-bar').style.width = `${(aerobicTE/5)*100}%`;
            document.getElementById('te-aerobic-desc').innerText = aerobicTE >= 4 ? "Altamente Productivo" : aerobicTE >= 3 ? "Mejora Aeróbica" : "Mantenimiento Base";
            
            document.getElementById('te-anaerobic-val').innerText = anaerobicTE.toFixed(1);
            document.getElementById('te-anaerobic-bar').style.width = `${(anaerobicTE/5)*100}%`;
            document.getElementById('te-anaerobic-desc').innerText = anaerobicTE >= 4 ? "Capacidad Láctica Severa" : anaerobicTE >= 3 ? "Mejora Anaeróbica" : anaerobicTE >= 2 ? "Estímulo Ligero" : "Sin Estímulo Directo";

            let effortText = "Moderado"; let effortColor = "bg-emerald-900/60 text-emerald-400 border border-emerald-800";
            
            if (avgHr && avgHr > 50) {
                if (avgHr < hrZones.z2) { effortText = "Recuperación"; effortColor = "bg-sky-900/60 text-sky-400 border border-sky-800"; }
                else if (avgHr < hrZones.z3) { effortText = "Moderado"; effortColor = "bg-emerald-900/60 text-emerald-400 border border-emerald-800"; }
                else if (avgHr < hrZones.z4) { effortText = "Duro"; effortColor = "bg-orange-900/60 text-orange-400 border border-orange-800"; }
                else { effortText = "Muy Duro"; effortColor = "bg-rose-900/60 text-rose-400 border border-rose-800"; }
            } else {
                let hours = activeSeconds / 3600;
                let intensity = hours > 0 ? hardnessScore / hours : 0;
                if (intensity < 30) { effortText = "Paseo"; effortColor = "bg-sky-900/60 text-sky-400 border border-sky-800"; }
                else if (intensity < 60) { effortText = "Moderado"; effortColor = "bg-emerald-900/60 text-emerald-400 border border-emerald-800"; }
                else if (intensity < 100) { effortText = "Duro"; effortColor = "bg-orange-900/60 text-orange-400 border border-orange-800"; }
                else { effortText = "Muy Duro"; effortColor = "bg-rose-900/60 text-rose-400 border border-rose-800"; }
            }
            
            const effortBadge = document.getElementById('stat-effort');
            const effortContainer = document.getElementById('effort-container');
            effortBadge.innerText = effortText;
            effortBadge.className = `text-sm font-bold px-3 py-1 rounded-md inline-block leading-none ${effortColor}`;
            if (avgHr && avgHr > 50) effortContainer.title = "Esfuerzo estimado en base a la medición real de tus pulsaciones medias (FC).";
            else effortContainer.title = "Esfuerzo estimado evaluando algorítmicamente la dureza del terreno (pendientes), la velocidad y la duración (sin datos de pulso).";

            let p5 = getPeakPower(track, 5); let p60 = getPeakPower(track, 60);
            let p300 = getPeakPower(track, 300); let p1200 = getPeakPower(track, 1200);

            document.getElementById('pc-5s').innerText = p5 !== '--' ? p5 + ' W' : '-- W';
            document.getElementById('pc-1m').innerText = p60 !== '--' ? p60 + ' W' : '-- W';
            document.getElementById('pc-5m').innerText = p300 !== '--' ? p300 + ' W' : '-- W';
            document.getElementById('pc-20m').innerText = p1200 !== '--' ? p1200 + ' W' : '-- W';
            
            document.getElementById('pc-5s-wkg').innerText = p5 !== '--' ? (p5/mRider).toFixed(1) + ' W/kg' : '-- W/kg';
            document.getElementById('pc-1m-wkg').innerText = p60 !== '--' ? (p60/mRider).toFixed(1) + ' W/kg' : '-- W/kg';
            document.getElementById('pc-5m-wkg').innerText = p300 !== '--' ? (p300/mRider).toFixed(1) + ' W/kg' : '-- W/kg';
            document.getElementById('pc-20m-wkg').innerText = p1200 !== '--' ? (p1200/mRider).toFixed(1) + ' W/kg' : '-- W/kg';

            const tbody = document.getElementById('detailed-stats-body');
            tbody.innerHTML = '';
            const getMetrics = (arr) => {
                const valid = arr.filter(v => v !== null && !isNaN(v));
                if (!valid.length) return { min: '--', avg: '--', max: '--' };
                const min = Math.min(...valid); const max = Math.max(...valid);
                const avg = valid.reduce((a,b)=>a+b,0) / valid.length;
                return { min, avg, max };
            };
            const formatVal = (val, dec) => val === '--' ? val : val.toFixed(dec);

            const eleMetrics = getMetrics(track.map(p => p.baseEle));
            const speedMetrics = getMetrics(track.map(p => p.speed));
            const hrMetrics = getMetrics(track.map(p => p.hr));
            const cadMetrics = getMetrics(track.map(p => p.cad));
            const tempMetrics = getMetrics(track.map(p => p.temp));
            const powerMetrics = hasRecalculated ? getMetrics(track.filter(p => p.isMoving).map(p => p.power)) : { min: '--', avg: '--', max: '--' }; 
            speedMetrics.avg = avgSpeed;

            const rows = [
                { name: 'Distancia (km)', m: {min:'--', avg:'--', max:'--'}, dec: 2, total: segmentDistance.toFixed(2) },
                { name: 'Tiempo en Movimiento', m: {min:'--', avg:'--', max:'--'}, dec: 0, total: formatTime(activeSeconds) },
                { name: 'Elevación (m)', m: eleMetrics, dec: 0, total: '--' },
                { name: 'Desnivel Acumulado (m)', m: {min:'--', avg:'--', max:'--'}, dec: 0, total: `+${Math.round(totalAscent)} / -${Math.round(totalDescent)}` },
                { name: 'VAM (Vel. Ascenso Media)', m: {min:'--', avg:'--', max:'--'}, dec: 0, total: `${Math.round(vam)} m/h` },
                { name: 'Velocidad (km/h)', m: speedMetrics, dec: 1, total: '--' },
                { name: 'Potencia Estimada (W)', m: powerMetrics, dec: 0, total: hasRecalculated ? '--' : 'Pendiente' },
                { name: 'Calorías Estimadas', m: {min:'--', avg:'--', max:'--'}, dec: 0, total: hasRecalculated ? `${Math.round(kcal)} kcal` : 'Pendiente' },
                { name: 'Frec. Cardíaca (bpm)', m: hrMetrics, dec: 0, total: '--' },
                { name: 'Cadencia (rpm)', m: cadMetrics, dec: 0, total: '--' },
                { name: 'Temperatura (°C)', m: tempMetrics, dec: 1, total: '--' }
            ];

            rows.forEach(r => {
                const blurClass = (!hasRecalculated && (r.name === 'Potencia Estimada (W)' || r.name === 'Calorías Estimadas')) ? 'blur-[2px] opacity-50 select-none' : '';
                tbody.innerHTML += `
                    <tr class="transition-colors hover:bg-gray-800 ${blurClass}">
                        <td class="py-3 px-4 font-medium text-gray-300">${r.name}</td>
                        <td class="py-3 px-4 text-teal-400 font-bold">${r.total}</td>
                        <td class="py-3 px-4 text-gray-400">${formatVal(r.m.min, r.dec)}</td>
                        <td class="py-3 px-4 text-gray-200 font-semibold">${formatVal(r.m.avg, r.dec)}</td>
                        <td class="py-3 px-4 text-gray-400">${formatVal(r.m.max, r.dec)}</td>
                    </tr>
                `;
            });
        }

        function syncHighlight(globalIndex, source, isAnimation = false) {
            let track = getWorkingTrack();
            if (!track || !track[globalIndex]) return;
            const pt = track[globalIndex];

            if (pt.lat && pt.lon && map) {
                if (!hoverMarker) {
                    hoverMarker = L.circleMarker([pt.lat, pt.lon], {
                        radius: 6, color: '#fff',
                        fillColor: source === 'sim' ? '#eab308' : '#14b8a6',
                        fillOpacity: 1, weight: 2, zIndexOffset: 1000
                    }).addTo(map);
                } else {
                    hoverMarker.setLatLng([pt.lat, pt.lon]);
                    hoverMarker.setStyle({ fillColor: source === 'sim' ? '#eab308' : '#14b8a6', radius: source === 'sim' ? 8 : 6 });
                    if(!map.hasLayer(hoverMarker)) hoverMarker.addTo(map);
                }
            }

            const charts = [
                {id: 'chartElevation', chart: chartElevation},
                {id: 'chartSpeed', chart: chartSpeed},
                {id: 'chartHR', chart: chartHR},
                {id: 'chartCad', chart: chartCad},
                {id: 'chartPower', chart: chartPower},
                {id: 'chartTemp', chart: chartTemp},
                {id: 'modalCanvas', chart: modalChartInstance} 
            ];

            charts.forEach(c => {
                if (c.chart && c.id !== source) {
                    const meta = c.chart.getDatasetMeta(0);
                    if (meta.data[globalIndex]) {
                        c.chart.setActiveElements([{ datasetIndex: 0, index: globalIndex }]);
                        c.chart.tooltip.setActiveElements([{ datasetIndex: 0, index: globalIndex }], {
                            x: meta.data[globalIndex].x,
                            y: meta.data[globalIndex].y
                        });
                        if (isAnimation) c.chart.update('none');
                        else c.chart.update();
                    }
                }
            });
        }

        function clearHighlight() {
            if (isSimulating) return; 
            if (hoverMarker && map && map.hasLayer(hoverMarker)) map.removeLayer(hoverMarker);
            const charts = [chartElevation, chartSpeed, chartHR, chartCad, chartPower, chartTemp, modalChartInstance];
            charts.forEach(c => {
                if (c) {
                    c.setActiveElements([]);
                    c.tooltip.setActiveElements([], {x:0, y:0});
                    c.update();
                }
            });
        }

        function initOrUpdateMap() {
            if (!map) {
                const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' });
                const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenTopoMap' });
                const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri' });

                map = L.map('map', { layers: [osm] });
                
                L.control.layers({ "Mapa Normal": osm, "Topográfico": topo, "Satélite": sat }).addTo(map);

                map.on('mousemove', function(e) {
                    if (isSimulating) return; 
                    let track = getWorkingTrack();
                    if (!track.length) return;
                    let minSqDist = Infinity; let closestIndex = -1;
                    const lat = e.latlng.lat; const lng = e.latlng.lng;
                    for(let i=0; i<track.length; i++) {
                        const pt = track[i];
                        if(pt.lat && pt.lon) {
                            const sqDist = (pt.lat - lat)**2 + (pt.lon - lng)**2;
                            if(sqDist < minSqDist) { minSqDist = sqDist; closestIndex = i; }
                        }
                    }
                    if(closestIndex !== -1 && minSqDist < 0.0005) syncHighlight(closestIndex, 'map');
                    else clearHighlight();
                });
                map.on('mouseout', clearHighlight);
            }

            if (mapLayerGroup) map.removeLayer(mapLayerGroup);
            mapLayerGroup = L.layerGroup().addTo(map);
            
            if (climbMarkersLayerGroup) map.removeLayer(climbMarkersLayerGroup);
            climbMarkersLayerGroup = L.layerGroup().addTo(map);

            let track = getWorkingTrack();
            if(track.length === 0) return;

            let colorMode = document.getElementById('mapColorMode').value;
            let bounds = L.latLngBounds();
            
            let currentLine = [];
            let currentColor = null;

            for(let i=0; i<track.length; i++) {
                let pt = track[i];
                if (!pt.lat || !pt.lon) continue;
                bounds.extend([pt.lat, pt.lon]);

                let targetColor = '#14b8a6'; 
                if (colorMode === 'speed') {
                    let speed = pt.speed || 0;
                    if (speed < 15) targetColor = '#14b8a6'; 
                    else if (speed < 25) targetColor = '#10b981'; 
                    else if (speed < 35) targetColor = '#eab308'; 
                    else if (speed < 45) targetColor = '#f97316'; 
                    else targetColor = '#f43f5e'; 
                } 
                else if (colorMode === 'hr' && pt.hr) {
                    if (pt.hr < hrZones.z2) targetColor = '#6b7280'; 
                    else if (pt.hr < hrZones.z3) targetColor = '#38bdf8'; 
                    else if (pt.hr < hrZones.z4) targetColor = '#10b981'; 
                    else if (pt.hr < hrZones.z5) targetColor = '#f97316'; 
                    else targetColor = '#f43f5e'; 
                }

                if (targetColor !== currentColor && currentLine.length > 0) {
                    currentLine.push([pt.lat, pt.lon]);
                    L.polyline(currentLine, {color: currentColor, weight: 4}).addTo(mapLayerGroup);
                    currentLine = [[pt.lat, pt.lon]];
                    currentColor = targetColor;
                } else {
                    currentLine.push([pt.lat, pt.lon]);
                    if (currentColor === null) currentColor = targetColor;
                }
            }
            if (currentLine.length > 1) L.polyline(currentLine, {color: currentColor, weight: 4}).addTo(mapLayerGroup);

            climbsDetected.forEach((climb, index) => {
                if (climb.startIdx >= trimStartIdx && climb.startIdx <= trimEndIdx) {
                    let pt = mergedTrack[climb.startIdx];
                    if (pt && pt.lat && pt.lon) {
                        let marker = L.marker([pt.lat, pt.lon], { icon: climbIcon, zIndexOffset: 500 }).addTo(climbMarkersLayerGroup);
                        let tooltipText = `⛰️ Ascenso ${index+1}: ${climb.distance.toFixed(1)}km | +${Math.round(climb.ascent)}m | ${climb.avgGrade.toFixed(1)}% <br><small class="text-gray-200">Click para aislar subida.</small>`;
                        marker.bindTooltip(tooltipText, { permanent: false, direction: 'top', className: 'climb-tooltip', offset: [0, -12] });
                        marker.on('click', (e) => {
                            L.DomEvent.stopPropagation(e);
                            selectSegment(climb.startIdx, climb.endIdx);
                        });
                    }
                }
            });

            if(bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
        }

        // --- CREADOR DE GRADIENTE PARA ZONAS HR ---
        function getHRGradient(ctx, chartArea, scales, isBg, scaleId = 'y') {
            if (!chartArea || !scales[scaleId]) return isBg ? chartColors.hrBg : chartColors.hr;
            const yAxis = scales[scaleId];
            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);

            const z2Px = yAxis.getPixelForValue(hrZones.z2);
            const z3Px = yAxis.getPixelForValue(hrZones.z3);
            const z4Px = yAxis.getPixelForValue(hrZones.z4);
            const z5Px = yAxis.getPixelForValue(hrZones.z5);

            const totalHeight = chartArea.bottom - chartArea.top;
            if (totalHeight <= 0) return isBg ? chartColors.hrBg : chartColors.hr;

            const getPct = (px) => {
                if (px === undefined || isNaN(px)) return 0;
                return Math.max(0, Math.min(1, (chartArea.bottom - px) / totalHeight));
            };

            const alphaBg = '33'; // ~20% transparencia
            const alphaBorder = 'ff'; // Sólido

            const hexToRgbaStr = (hex, isBackground) => isBackground ? hex + alphaBg : hex + alphaBorder;

            const cZ1 = hexToRgbaStr('#6b7280', isBg); // Z1 Gris
            const cZ2 = hexToRgbaStr('#38bdf8', isBg); // Z2 Azul
            const cZ3 = hexToRgbaStr('#10b981', isBg); // Z3 Verde
            const cZ4 = hexToRgbaStr('#f97316', isBg); // Z4 Naranja
            const cZ5 = hexToRgbaStr('#f43f5e', isBg); // Z5 Rojo

            // Puntos de parada duros para colores fijos por banda
            gradient.addColorStop(0, cZ1);
            gradient.addColorStop(getPct(z2Px), cZ1);
            gradient.addColorStop(getPct(z2Px), cZ2);
            gradient.addColorStop(getPct(z3Px), cZ2);
            gradient.addColorStop(getPct(z3Px), cZ3);
            gradient.addColorStop(getPct(z4Px), cZ3);
            gradient.addColorStop(getPct(z4Px), cZ4);
            gradient.addColorStop(getPct(z5Px), cZ4);
            gradient.addColorStop(getPct(z5Px), cZ5);
            gradient.addColorStop(1, cZ5);

            return gradient;
        }

        function renderCharts() {
            let track = getWorkingTrack();
            if(!track.length) return;

            let firstPtTime = track[0].time;
            let firstPtDist = track[0].dist;

            const labels = track.map(p => xAxisMode === 'distance' ? (p.dist - firstPtDist).toFixed(2) : ((p.time - firstPtTime) / 60000).toFixed(1));
            
            const eleData = track.map(p => p.baseEle);
            const speedData = track.map(p => p.speed);
            const hrData = track.map(p => p.hr);
            const tempData = track.map(p => p.temp);
            const cadData = track.map(p => p.cad);
            const powerData = hasRecalculated ? track.map(p => p.power) : track.map(p => null);

            currentChartData = { labels, ele: eleData, speed: speedData, hr: hrData, cad: cadData, power: powerData, temp: tempData };

            const xTitle = xAxisMode === 'distance' ? 'Distancia (km)' : 'Tiempo (minutos)';

            createChart('chartElevation', chartElevation, 'Elevación (m)', labels, eleData, chartColors.ele, chartColors.eleBg, xTitle, (c) => chartElevation = c, 1);
            createChart('chartSpeed', chartSpeed, 'Velocidad (km/h)', labels, speedData, chartColors.speed, chartColors.speedBg, xTitle, (c) => chartSpeed = c, 1);
            createChart('chartPower', chartPower, 'Potencia virtual (W)', labels, powerData, chartColors.power, chartColors.powerBg, xTitle, (c) => chartPower = c, 0);
            createChart('chartHR', chartHR, 'Frecuencia Cardíaca (bpm)', labels, hrData, chartColors.hr, chartColors.hrBg, xTitle, (c) => chartHR = c, 0);
            createChart('chartCad', chartCad, 'Cadencia (rpm)', labels, cadData, chartColors.cad, chartColors.cadBg, xTitle, (c) => chartCad = c, 0);
            createChart('chartTemp', chartTemp, 'Temperatura (°C)', labels, tempData, chartColors.temp, chartColors.tempBg, xTitle, (c) => chartTemp = c, 1);
            
            const curveDurations = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 3600];
            const curveLabels = ['1s', '5s', '10s', '30s', '1m', '2m', '5m', '10m', '20m', '1h'];
            let curveData = [];
            if (hasRecalculated) {
                curveDurations.forEach(sec => {
                    let peak = getPeakPower(track, sec);
                    curveData.push(peak !== '--' ? peak : null);
                });
            } else {
                curveData = curveDurations.map(() => null);
            }
            renderPowerCurveChart(curveLabels, curveData);

            if(document.getElementById('chartModal').classList.contains('hidden') === false) updateModalChart();
        }

        function renderPowerCurveChart(labels, data) {
            const canvas = document.getElementById('chartPowerCurve');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (chartPowerCurveInstance) chartPowerCurveInstance.destroy();

            chartPowerCurveInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Potencia Pico (W)', data: data, borderColor: chartColors.power, backgroundColor: chartColors.powerBg,
                        borderWidth: 2, fill: true, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#1f2937', pointBorderColor: chartColors.power, tension: 0.4, spanGaps: true
                    }]
                },
                options: {
                    layout: { padding: { top: 15 } },
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            displayColors: false, position: 'topAlign', caretSize: 0, yAlign: 'bottom', xAlign: 'left',
                            callbacks: {
                                label: function(context) {
                                    let mRider = parseFloat(document.getElementById('inputRiderWeight').value) || 105;
                                    let w = context.raw;
                                    if(w === null) return 'Datos insuficientes';
                                    let wkg = (w / mRider).toFixed(1);
                                    return `${Math.round(w)} W  (${wkg} W/kg)`;
                                },
                                title: function(tooltipItems) { return `Pico de ${tooltipItems[0].label}`; }
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true, title: { display: true, text: 'Vatios (W)', font: { size: 10 } }, ticks: { maxTicksLimit: 6 } }
                    }
                },
                plugins: [verticalCrosshairPlugin]
            });
        }

        const metricDetails = {
            ele: { label: 'Elevación (m)', color: chartColors.ele, bgColor: chartColors.eleBg, decimals: 1 },
            speed: { label: 'Velocidad (km/h)', color: chartColors.speed, bgColor: chartColors.speedBg, decimals: 1 },
            hr: { label: 'Frecuencia Cardíaca (bpm)', color: chartColors.hr, bgColor: chartColors.hrBg, decimals: 0 },
            cad: { label: 'Cadencia (rpm)', color: chartColors.cad, bgColor: chartColors.cadBg, decimals: 0 },
            power: { label: 'Potencia (W)', color: chartColors.power, bgColor: chartColors.powerBg, decimals: 0 },
            temp: { label: 'Temperatura (°C)', color: chartColors.temp, bgColor: chartColors.tempBg, decimals: 1 }
        };

        function openModalChart(baseMetric) {
            const modal = document.getElementById('chartModal');
            const modalContent = document.getElementById('chartModalContent');
            document.querySelectorAll('.modal-toggle').forEach(cb => { cb.checked = (cb.value === baseMetric); });
            
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                modalContent.classList.remove('scale-95');
                const elem = document.documentElement;
                if (elem.requestFullscreen) elem.requestFullscreen().catch(err => console.log(err));
            }, 10);
            updateModalChart();
        }

        function closeModalChart() {
            const modal = document.getElementById('chartModal');
            const modalContent = document.getElementById('chartModalContent');
            modal.classList.add('opacity-0');
            modalContent.classList.add('scale-95');
            
            if (document.fullscreenElement) {
                if (document.exitFullscreen) document.exitFullscreen();
            }
            setTimeout(() => {
                modal.classList.add('hidden');
                if (modalChartInstance) { modalChartInstance.destroy(); modalChartInstance = null; }
            }, 300); 
        }

        document.querySelectorAll('.modal-toggle').forEach(cb => { cb.addEventListener('change', updateModalChart); });

        function updateModalChart() {
            const activeMetrics = Array.from(document.querySelectorAll('.modal-toggle')).filter(cb => cb.checked).map(cb => cb.value);
            if (activeMetrics.length === 0) return; 

            const ctx = document.getElementById('modalCanvas').getContext('2d');
            if (modalChartInstance) modalChartInstance.destroy();

            const datasets = activeMetrics.map((metric, index) => {
                const conf = metricDetails[metric];
                const isHR = metric === 'hr';

                const bColor = isHR ? function(context) {
                    if (hrChartMode === 'zones') return getHRGradient(context.chart.ctx, context.chart.chartArea, context.chart.scales, false, `y-${metric}`);
                    return conf.color;
                } : conf.color;

                const bgC = isHR ? function(context) {
                    if (hrChartMode === 'zones') return getHRGradient(context.chart.ctx, context.chart.chartArea, context.chart.scales, true, `y-${metric}`);
                    return conf.bgColor;
                } : conf.bgColor;

                return {
                    label: conf.label, data: currentChartData[metric],
                    borderColor: bColor, backgroundColor: bgC,
                    borderWidth: 2, fill: activeMetrics.length === 1, 
                    pointRadius: 0, tension: 0.3, spanGaps: true,
                    yAxisID: `y-${metric}`
                };
            });

            const scales = { x: { title: { display: true, text: xAxisMode === 'distance' ? 'Distancia (km)' : 'Tiempo (minutos)' }, ticks: { maxTicksLimit: 15 } } };

            activeMetrics.forEach((metric, index) => {
                scales[`y-${metric}`] = {
                    type: 'linear', display: true, position: index % 2 === 0 ? 'left' : 'right', 
                    title: { display: true, text: metricDetails[metric].label }, grid: { drawOnChartArea: index === 0 } 
                };
            });

            modalChartInstance = new Chart(ctx, {
                type: 'line',
                data: { labels: currentChartData.labels, datasets: datasets },
                options: {
                    layout: { padding: { top: 15 } },
                    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                    onHover: (event, elements) => {
                        if (isSimulating) return;
                        if (elements && elements.length) syncHighlight(elements[0].index, 'modalCanvas');
                        else clearHighlight();
                    },
                    plugins: {
                        legend: { display: true, position: 'top', labels: { usePointStyle: true, boxWidth: 8, color: '#e5e7eb' } },
                        tooltip: { 
                            mode: 'index', intersect: false, position: 'topAlign', caretSize: 0, yAlign: 'bottom', xAlign: 'left',
                            callbacks: {
                                label: function(context) {
                                    let val = context.raw;
                                    if (val === null || isNaN(val)) return `${context.dataset.label}: --`;
                                    let metric = context.dataset.yAxisID.replace('y-', '');
                                    let decimals = metricDetails[metric] ? metricDetails[metric].decimals : 0;
                                    return `${context.dataset.label}: ${val.toFixed(decimals)}`;
                                }
                            }
                        }
                    },
                    scales: scales
                },
                plugins: [verticalCrosshairPlugin]
            });
        }

        function createChart(canvasId, chartInstance, title, labels, data, color, bgColor, xTitle, saveInstance, decimals = 0) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (chartInstance) chartInstance.destroy();

            const hasData = data.some(d => d !== null && !isNaN(d));
            const isHR = canvasId === 'chartHR';

            const bColor = isHR ? function(context) {
                if (hrChartMode === 'zones') return getHRGradient(context.chart.ctx, context.chart.chartArea, context.chart.scales, false, 'y');
                return color;
            } : color;

            const bgC = isHR ? function(context) {
                if (hrChartMode === 'zones') return getHRGradient(context.chart.ctx, context.chart.chartArea, context.chart.scales, true, 'y');
                return bgColor;
            } : bgColor;

            const newChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: title, data: data, borderColor: bColor, backgroundColor: bgC,
                        borderWidth: 2, fill: true, pointRadius: 0, tension: 0.3, spanGaps: true 
                    }]
                },
                options: {
                    layout: { padding: { top: 15 } },
                    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                    onHover: (event, elements) => {
                        if (isSimulating) return;
                        if (elements && elements.length) syncHighlight(elements[0].index, canvasId);
                        else clearHighlight();
                    },
                    plugins: {
                        legend: { display: false },
                        title: { display: true, text: hasData ? title : `${title} (Sin Datos)`, font: { size: 16 } },
                        tooltip: {
                            position: 'topAlign', caretSize: 0, yAlign: 'bottom', xAlign: 'left', intersect: false, mode: 'index',
                            callbacks: {
                                label: function(context) {
                                    let val = context.raw;
                                    if (val === null || isNaN(val)) return `${context.dataset.label}: --`;
                                    return `${context.dataset.label}: ${val.toFixed(decimals)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { title: { display: true, text: xTitle }, ticks: { maxTicksLimit: 10 } },
                        y: { title: { display: false } }
                    }
                },
                plugins: [verticalCrosshairPlugin]
            });
            saveInstance(newChart);
        }