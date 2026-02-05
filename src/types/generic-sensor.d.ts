/**
 * Generic Sensor API type declarations
 * @see https://www.w3.org/TR/generic-sensor/
 * @see https://www.w3.org/TR/accelerometer/
 * @see https://www.w3.org/TR/gyroscope/
 */

interface SensorOptions {
  frequency?: number;
  referenceFrame?: 'device' | 'screen';
}

interface SensorErrorEvent extends Event {
  error: DOMException;
}

interface Sensor extends EventTarget {
  readonly activated: boolean;
  readonly hasReading: boolean;
  readonly timestamp?: DOMHighResTimeStamp;
  start(): void;
  stop(): void;
  onreading: ((this: Sensor, ev: Event) => any) | null;
  onerror: ((this: Sensor, ev: SensorErrorEvent) => any) | null;
  onactivate: ((this: Sensor, ev: Event) => any) | null;
}

interface Accelerometer extends Sensor {
  readonly x: number | null;
  readonly y: number | null;
  readonly z: number | null;
}

interface Gyroscope extends Sensor {
  readonly x: number | null;
  readonly y: number | null;
  readonly z: number | null;
}

interface AccelerometerConstructor {
  new (options?: SensorOptions): Accelerometer;
  prototype: Accelerometer;
}

interface GyroscopeConstructor {
  new (options?: SensorOptions): Gyroscope;
  prototype: Gyroscope;
}

declare var Accelerometer: AccelerometerConstructor;
declare var Gyroscope: GyroscopeConstructor;
