// Adapted from ai-grid-prototype's VisionFleetMap: same Leaflet basemap and pin styling.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GridCluster } from '~/app/types/clusters';
const tiles='https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const attribution='Tiles &copy; Esri &mdash; Esri, TomTom, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors';
export default function GridFleetMap({clusters,selected,onSelect}:{clusters:GridCluster[];selected:string|null;onSelect:(name:string)=>void}) {
  const container=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layer=useRef<L.LayerGroup|null>(null),lastBounds=useRef('');
  const select=useRef(onSelect);select.current=onSelect;const [tileError,setTileError]=useState(false);
  useEffect(()=>{
    if(!container.current)return;
    const instance=L.map(container.current,{scrollWheelZoom:true,attributionControl:true}).setView([45,-40],3);
    map.current=instance;layer.current=L.layerGroup().addTo(instance);
    L.tileLayer(tiles,{attribution,maxZoom:16}).on('tileerror',()=>setTileError(true)).addTo(instance);
    const observer=new ResizeObserver(()=>instance.invalidateSize());observer.observe(container.current);
    return ()=>{observer.disconnect();instance.remove();map.current=null;layer.current=null;lastBounds.current='';};
  },[]);
  useEffect(()=>{
    if(!map.current || !layer.current)return;
    layer.current.clearLayers();const bounds=L.latLngBounds([]);
    const mapped=clusters.filter(c=>c.latitude!==undefined && c.longitude!==undefined);
    mapped.forEach(cluster=>{
      // Separate co-located cluster pins so each remains selectable.
      const siblings=mapped.filter(c=>c.latitude===cluster.latitude && c.longitude===cluster.longitude).sort((a,b)=>a.name.localeCompare(b.name));
      const i=siblings.findIndex(c=>c.name===cluster.name),angle=i*2*Math.PI/siblings.length;
      const latLng:L.LatLngExpression=[cluster.latitude!+(siblings.length>1 ? Math.sin(angle)*0.12 : 0),cluster.longitude!+(siblings.length>1 ? Math.cos(angle)*0.12 : 0)];
      const focused=selected===cluster.name,color=focused ? '#0066cc' : cluster.status==='Ready' ? '#3d7317' : cluster.status==='Offline' ? '#ee0000' : '#6a6e73';
      const marker=L.circleMarker(latLng,{radius:focused ? 10 : 7,color,weight:focused ? 3 : 2,fillColor:color,fillOpacity:0.35,opacity:0.85});
      // A text node avoids interpreting cluster metadata as HTML.
      const tooltip=document.createElement('span');tooltip.textContent=focused ? `${cluster.siteName ?? cluster.site ?? 'Site unassigned'} · ${cluster.name} · ${cluster.status}` : (cluster.siteName ?? cluster.site ?? cluster.name);
      marker.bindTooltip(tooltip,{direction:'top',opacity:1,permanent:true}).on('click',()=>select.current(cluster.name)).addTo(layer.current!);bounds.extend(latLng);
    });
    const signature=mapped.map(c=>`${c.name}:${c.latitude}:${c.longitude}`).join('|');
    if(signature!==lastBounds.current){if(mapped.length)map.current.fitBounds(bounds.pad(0.35),{maxZoom:6,animate:false});else map.current.setView([45,-40],3);lastBounds.current=signature;}
    map.current.invalidateSize();
  },[clusters,selected]);
  return <div className="vision-fleet-map"><div ref={container} className="vision-fleet-map__leaflet" aria-label="AI Grid map of clusters"/>
    {tileError && <p className="fleet-map-notice">Basemap tiles unavailable. Cluster pins and the cluster list remain available.</p>}
    {!clusters.some(c=>c.latitude!==undefined && c.longitude!==undefined) && <p className="vision-fleet-map__empty">No mapped clusters. Add site coordinates to ManagedCluster annotations.</p>}
    <div className="vision-fleet-map__legend"><span className="fleet-legend-ready">Available</span><span className="fleet-legend-offline">Unavailable</span><span className="fleet-legend-unknown">Unknown</span></div>
  </div>;
}
