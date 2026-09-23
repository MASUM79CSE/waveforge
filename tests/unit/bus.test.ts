import { describe, expect, test } from 'vitest';
import { Bus } from '../../src/core/bus';

interface TestEvents {
  ping: number;
  label: string;
}

describe('Bus', () => {
  test('delivers payloads to every subscriber', () => {
    const bus = new Bus<TestEvents>();
    const seen: number[] = [];

    bus.on('ping', (v) => seen.push(v));
    bus.on('ping', (v) => seen.push(v * 10));
    bus.emit('ping', 7);

    expect(seen).toEqual([7, 70]);
  });

  test('unsubscribe stops delivery for that handler only', () => {
    const bus = new Bus<TestEvents>();
    const seen: string[] = [];

    const offA = bus.on('label', (v) => seen.push(`a:${v}`));
    bus.on('label', (v) => seen.push(`b:${v}`));

    offA();
    bus.emit('label', 'x');

    expect(seen).toEqual(['b:x']);
  });

  test('emitting with no subscribers is a safe no-op', () => {
    const bus = new Bus<TestEvents>();
    expect(() => bus.emit('ping', 1)).not.toThrow();
  });

  test('events are independent by name', () => {
    const bus = new Bus<TestEvents>();
    const seen: number[] = [];
    bus.on('ping', (v) => seen.push(v));
    bus.emit('label', 'unrelated');
    expect(seen).toEqual([]);
  });
});
