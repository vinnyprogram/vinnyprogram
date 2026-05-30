import { useState, useMemo } from "react";
import { supabase } from "../lib/supabase";

export default function MeasurementPanel({ leadId, inspectionId }) {
  const [floor, setFloor] = useState("Attic");
  const [area, setArea] = useState("Roofline");

  const [material, setMaterial] = useState("Open Cell Foam");
  const [rValue, setRValue] = useState("R38");
  const [framing, setFraming] = useState("2x10");

  const [height, setHeight] = useState("");
  const [length, setLength] = useState("");

  const [segments, setSegments] = useState([]);

  const totalSqft = useMemo(() => {
    return segments.reduce((sum, s) => sum + s.sqft, 0);
  }, [segments]);

  function calcSqft(h, l) {
    return Number(h || 0) * Number(l || 0);
  }

  function addSegment() {
    if (!height || !length) return;

    const sqft = calcSqft(height, length);

    setSegments((prev) => [
      ...prev,
      { height, length, sqft }
    ]);

    setHeight("");
    setLength("");
  }

  async function saveArea() {
  if (segments.length === 0) return;

  // 1. Get or create floor
  let { data: floorRow } = await supabase
    .from("floors")
    .select("*")
    .eq("project_id", inspectionId)
    .eq("name", floor)
    .single();

  if (!floorRow) {
    const { data: newFloor, error: floorError } = await supabase
      .from("floors")
      .insert([
        {
          project_id: inspectionId,
          name: floor
        }
      ])
      .select()
      .single();

    if (floorError) {
      console.error(floorError);
      return;
    }

    floorRow = newFloor;
  }

  // 2. Calculate totals
  const sqft = segments.reduce(
    (sum, s) => sum + Number(s.sqft),
    0
  );

  // 3. Create area
  const { data: areaRow, error: areaError } = await supabase
    .from("areas")
    .insert([
      {
        project_id: inspectionId,
        floor_id: floorRow.id,
        area_type: area,
        material,
        r_value: rValue,
        sqft,
        sqft_source: "segments"
      }
    ])
    .select()
    .single();

  if (areaError) {
    console.error(areaError);
    return;
  }

  // 4. Save segments
  const segmentPayload = segments.map((s, i) => ({
    area_id: areaRow.id,
    label: `Segment ${i + 1}`,
    height: Number(s.height),
    length: Number(s.length),
    sqft: Number(s.sqft),
    source: "manual"
  }));

  const { error: segmentError } = await supabase
    .from("segments")
    .insert(segmentPayload);

  if (segmentError) {
    console.error(segmentError);
    return;
  }

  // reset
  setSegments([]);
}

  return (
    <div style={styles.card}>
      <h3 style={{ marginBottom: 10 }}>Measurement Entry</h3>

      <div style={styles.row}>
        <select value={floor} onChange={(e) => setFloor(e.target.value)}>
          <option>Attic</option>
          <option>2nd Floor</option>
          <option>1st Floor</option>
          <option>Basement</option>
        </select>

        <select value={area} onChange={(e) => setArea(e.target.value)}>
          <option>Roofline</option>
          <option>Exterior Wall</option>
          <option>Rim Joist</option>
          <option>Ceiling</option>
        </select>
      </div>

      <div style={styles.row}>
        <input
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          placeholder="Material"
        />

        <input
          value={rValue}
          onChange={(e) => setRValue(e.target.value)}
          placeholder="R-Value"
        />

        <input
          value={framing}
          onChange={(e) => setFraming(e.target.value)}
          placeholder="Framing"
        />
      </div>

      <div style={styles.row}>
        <input
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          placeholder="Height"
        />

        <input
          value={length}
          onChange={(e) => setLength(e.target.value)}
          placeholder="Length"
        />

        <button onClick={addSegment}>+ Add</button>
      </div>

      <div style={styles.total}>
        Total: {totalSqft} sqft
      </div>

      <div>
        {segments.map((s, i) => (
          <div key={i} style={styles.segment}>
            {s.height} × {s.length} = {s.sqft} sqft
          </div>
        ))}
      </div>

      <button onClick={saveArea} style={styles.saveBtn}>
        Save Area
      </button>
    </div>
  );
}

const styles = {
  card: {
    background: "white",
    padding: 16,
    borderRadius: 14,
    border: "1px solid #eee",
    marginBottom: 20
  },
  row: {
    display: "flex",
    gap: 8,
    marginBottom: 10
  },
  total: {
    fontWeight: "bold",
    margin: "10px 0"
  },
  segment: {
    fontSize: 13,
    padding: 6,
    background: "#f5f7fb",
    borderRadius: 8,
    marginBottom: 5
  },
  saveBtn: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "none",
    background: "#111827",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer"
  }
};