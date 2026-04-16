export type MouseEventRecord = {
  time: number;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  type: 'move' | 'click';
};

export type CameraKeyframe = {
  time: number;
  x: number;
  y: number;
  scale: number;
  easing?: 'subtle' | 'medium' | 'fast';
};

export class SmartZoomEngine {
  private events: MouseEventRecord[] = [];
  private duration: number = 0;

  // Configuration
  private DWELL_TIME_THRESHOLD = 0.8; // seconds to trigger zoom
  private DWELL_RADIUS = 3; // % of screen
  private ZOOM_SCALE = 150; // Default zoom scale

  public addEvent(event: MouseEventRecord) {
    // Clamp coordinates to 0-100 to ensure safe margins
    const clampedEvent = {
      ...event,
      x: Math.max(0, Math.min(100, event.x)),
      y: Math.max(0, Math.min(100, event.y))
    };
    this.events.push(clampedEvent);
  }

  public setDuration(duration: number) {
    this.duration = duration;
  }

  public clear() {
    this.events = [];
    this.duration = 0;
  }

  public generateKeyframes(): CameraKeyframe[] {
    if (this.events.length === 0) {
      return [{ time: 0, x: 50, y: 50, scale: 100 }];
    }

    const pois: { time: number, x: number, y: number }[] = [];
    let lastPoiTime = -999;
    let lastDwellX = -999;
    let lastDwellY = -999;
    let dwellStartIdx = 0;

    for (let i = 0; i < this.events.length; i++) {
      const ev = this.events[i];

      if (ev.type === 'click') {
        if (ev.time - lastPoiTime > 1.0) { // Debounce clicks
          pois.push({ time: ev.time, x: ev.x, y: ev.y });
          lastPoiTime = ev.time;
          lastDwellX = ev.x;
          lastDwellY = ev.y;
        }
        dwellStartIdx = i;
        continue;
      }

      const dwellStartEv = this.events[dwellStartIdx];
      const distFromDwellStart = Math.hypot(ev.x - dwellStartEv.x, ev.y - dwellStartEv.y);

      if (distFromDwellStart > this.DWELL_RADIUS) {
        dwellStartIdx = i; // Reset dwell if moved too much
      } else if (ev.time - dwellStartEv.time >= this.DWELL_TIME_THRESHOLD) {
        // Dwell time reached!
        // Check if this is a NEW distinct location compared to the last recorded POI
        const distFromLastPoi = Math.hypot(ev.x - lastDwellX, ev.y - lastDwellY);
        
        if (distFromLastPoi > this.DWELL_RADIUS * 2) {
          pois.push({ time: ev.time, x: ev.x, y: ev.y });
          lastPoiTime = ev.time;
          lastDwellX = ev.x;
          lastDwellY = ev.y;
        }
        
        // Reset dwellStartIdx so we don't trigger every frame while holding still
        dwellStartIdx = i; 
      }
    }

    const keyframes: CameraKeyframe[] = [];
    keyframes.push({ time: 0, x: 50, y: 50, scale: 100 });

    for (let i = 0; i < pois.length; i++) {
      const poi = pois[i];
      const zoomInTime = Math.max(0.1, poi.time - 0.5);

      keyframes.push({
        time: zoomInTime,
        x: poi.x,
        y: poi.y,
        scale: this.ZOOM_SCALE,
        easing: 'medium'
      });

      const nextPoi = pois[i + 1];
      const nextTime = nextPoi ? nextPoi.time : this.duration;

      // If there's a long gap before the next point, zoom out
      if (nextTime - poi.time > 4.0) {
        keyframes.push({
          time: poi.time + 3.0,
          x: 50,
          y: 50,
          scale: 100,
          easing: 'subtle'
        });
      }
    }

    // Ensure we zoom out at the end
    const lastKf = keyframes[keyframes.length - 1];
    if (lastKf && lastKf.scale > 100 && this.duration - lastKf.time > 2.0) {
      keyframes.push({
        time: this.duration - 1.0,
        x: 50,
        y: 50,
        scale: 100,
        easing: 'subtle'
      });
    }

    return keyframes;
  }
}
