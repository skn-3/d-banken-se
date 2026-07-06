import { useEffect, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L, { type LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
}

const treeIcon = L.divIcon({
  className: "",
  html: `<div style="width:26px;height:26px;border-radius:50%;background:#1E9E6A;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;">🌳</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 5);
      return;
    }
    const bounds: LatLngBoundsExpression = points.map((p) => [p.lat, p.lng]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 });
  }, [map, points]);
  return null;
}

export function SkogMap({ points }: { points: MapPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!points.length) return null;
  return (
    <div ref={ref} className="h-[360px] w-full overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)" }}>
      <MapContainer
        center={[points[0].lat, points[0].lng]}
        zoom={4}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={treeIcon}>
            <Popup>
              <div style={{ fontFamily: "system-ui, sans-serif" }}>
                <div style={{ fontWeight: 600 }}>{p.label}</div>
                {p.sublabel ? <div style={{ fontSize: 12, opacity: 0.7 }}>{p.sublabel}</div> : null}
              </div>
            </Popup>
          </Marker>
        ))}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
