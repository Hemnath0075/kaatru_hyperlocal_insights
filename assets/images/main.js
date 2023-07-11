const host = 'www.bw01.kaatru.org';
var socket;
var selectedLayer = 'PM2.5 (ECMWF)';
var isActive = false;
var controller = new AbortController();

const data_endpoint = {
    'PM2.5 (CPCB)': 'cpcb_data',
    'PM2.5 (ECMWF)': 'nasa_data',
    'PM2.5 (Device)': 'device_data',
    'Road Condition': 'road_condition'
}


var map = L.map('map', {
    crs: L.CRS.EPSG3857,
    preferCanvas: true,
    center: [13.0008849, 77.5394712],
    zoom: 5,
    minZoom: 5,
    zoomControl: false,
    fullscreenControl: true,
});

const southWest = L.latLng(35.4940095078, 97.4025614766),
    northEast = L.latLng(7.96553477623, 68.1766451354);
const bounds = L.latLngBounds(southWest, northEast);

map.setMaxBounds(bounds);

const basemap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abcd',
    tms: false,
    noWrap: false,
    opacity: 1,
    detectRetina: false,
    maxNativeZoom: 14
}).addTo(map);

const heat = L.heatLayer([], { radius: 20, minOpacity: 0.2, blur: 20, maxZoom: 12 }).addTo(map);
const road_condition = L.featureGroup().addTo(map);



const marker1 = L.marker([0, 0]);
const marker2 = L.marker([0, 0]);
const marker3 = L.marker([0, 0]);
const marker4 = L.marker([0, 0]);
const marker5 = L.marker([0, 0]);
const temperature = L.tileLayer('https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=65efbef39f0483273b350642020b8b4c')
const precipitation = L.tileLayer('https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=65efbef39f0483273b350642020b8b4c')
const wind_speed = L.tileLayer('https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=65efbef39f0483273b350642020b8b4c')
const cloud_cover = L.tileLayer('https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=65efbef39f0483273b350642020b8b4c')

const overlays = {
    "Temperature": temperature,
    "Precipitation": precipitation,
    "Wind Speed": wind_speed,
    "Cloud Cover": cloud_cover,
    // "PM2.5 (CPCB)": marker1,
    "PM2.5 (ECMWF)": marker1,
    // "PM2.5 (Device)": marker5,
    "Road Condition": marker2
}

map.on('baselayerchange', loadData);
map.on('click', onClick)



L.control.layers(overlays, {}).addTo(map);
var legend = L.control({ position: "bottomright" });
legend.onAdd = onLegendAdd;
legend.addTo(map);
window.parent.addEventListener('message', handleMessage, false);
marker1.addTo(map);
      
function handleMessage(_) {
   if (isActive) {
    controller.abort();
    controller = new AbortController();
    isActive = false;
    heat.setLatLngs([]);
   }
}


async function loadData(e) {
    document.getElementsByClassName("legend").item(0).style.display = 'none';
    if (isActive) {
        controller.abort();
        controller = new AbortController();
    }
    isActive = false;
    heat.setLatLngs([]);
    road_condition.clearLayers();
    map.flyToBounds(bounds, { duration: 1 })
    if (e.name in data_endpoint) {
        document.getElementsByClassName("legend").item(0).style.display = 'block';
        selectedLayer = e.name;
        if (e.name == 'Road Condition') {
            changeLegendName('Road Condition');
            map.flyToBounds(L.latLngBounds(L.latLng(12.897685, 80.095812), L.latLng(13.116504, 80.292625)), { duration: 1 })
        }
        else {
            changeLegendName('PM 2.5');
        }
        const decoder = new TextDecoder();
        console.log(e);
        const response = await fetch(`https://${host}/${data_endpoint[e.name]}?api_key=password`, { signal: controller.signal }).catch((e) => console.log(e));
        isActive = true;
        const rs = response.body;
        const reader = rs.getReader()
        while (isActive) {
            try {
                const { done, value } = await reader.read()
                const string = decoder.decode(value)
                let previousValue = '';
                let json;
                string.split(';').forEach((element) => {
                    element = element.replace(/\bNaN\b/g, "0")
                    if (element.length != 0 && isActive) {
                        try {
                            json = JSON.parse(previousValue + element).data;
                            if (previousValue.length != 0) {
                                previousValue = '';
                            }
                            if (e.name == 'Road Condition') {
                                L.circleMarker([json[0], json[1]], { radius: 3, color: getColor(json[2]), fillColor: getColor(json[2]), opacity: 0.6, weight: 1 }).addTo(road_condition);
                            }
                            else {
                                heat.addLatLng(json);
                            }
                        }
                        catch (e) {
                            if (previousValue.length == 0) {
                                // console.log(element);
                                previousValue = element;
                            }
                            else {
                                // console.error(`double ${previousValue + element}`);
                                previousValue = '';
                            }

                        }
                    }
                })
                if (done) {
                    isActive = false;
                    return;
                }
            }
            catch (e) {
                // console.log(e);
            }
        }
    }
}


async function onClick(e) {
    if (selectedLayer != 'Road Condition') {
        const { lat, lng } = e.latlng;
        fetch(`https://${host}/on_click?api_key=password&lat=${lat}&lon=${lng}&data=${data_endpoint[selectedLayer]}`)
            .then(async (res) => {
                const data = await res.json().then((value) => value.data);
               if (data['pm2.5_cpcb'] == 0) {
                L.popup()
                    .setLatLng(e.latlng)
                    .setContent(`<h3> <b><strong>Not available outside India</strong></h3></b>`)
                    .openOn(map);
               }
               else {
                L.popup()
                    .setLatLng(e.latlng)
                    .setContent(`<h3> <b>PM 2.5 :<strong>  ${data['pm2.5_cpcb']}  µg/m<sup>3</sup> ${selectedLayer.split(' ')[1]} </strong></h3></b>`)
                    .openOn(map);
               }
                
            })
            .catch((err) => {
                console.log("ERROR", err)
            })
    }
}

function getColor(x) {
    if (Math.abs(x) < 0.35) {
        return 'red'
    }
    if (Math.abs(x) < 0.70) {
        return 'green'
    }
    return 'blue';
}

function sleep(milliseconds) {
    const date = Date.now();
    let currentDate = null;
    do {
        currentDate = Date.now();
    } while (currentDate - date < milliseconds);
}

function onLegendAdd() {
    const div = L.DomUtil.create("div", "legend");
    div.style.height = "30vh"
    div.style.backgroundColor = "rgb(0, 0, 0, 0.7)";
    div.style.padding = '1.5rem'
    div.innerHTML += "<h4 style='color: white'>PM 2.5</h4><br>";
    div.innerHTML += '<i style="background-image: linear-gradient(red, lime, blue); height: 25vh"></i><div class="col"> <span> Poor </span><span> Moderate </span><span> Good </span> </div>';
    return div;
};

function changeLegendName(name) {
    try {
        let nameHolder = document.getElementsByTagName('h4');
        nameHolder.item(0).innerText = name;
    }
    catch (e) {
        console.log(e);
    }
}

