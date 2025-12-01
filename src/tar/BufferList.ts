/**
 * BufferList - Simple linked list for buffering streaming data
 *
 * Node 0.8 compatible - uses only basic Buffer APIs:
 * - new Buffer(size)
 * - Buffer.copy(target, targetStart, sourceStart, sourceEnd)
 * - Buffer.slice(start, end)
 * - Buffer.length
 */

interface BufferNode {
  data: Buffer;
  next: BufferNode | null;
}

export default class BufferList {
  private head: BufferNode | null = null;
  private tail: BufferNode | null = null;
  length = 0;

  /**
   * Append a buffer to the end of the list
   */
  append(buf: Buffer): void {
    const node: BufferNode = { data: buf, next: null };

    if (this.tail) {
      this.tail.next = node;
      this.tail = node;
    } else {
      this.head = node;
      this.tail = node;
    }

    this.length += buf.length;
  }

  /**
   * Consume and return n bytes from the front
   * Returns a new buffer containing the consumed bytes
   */
  consume(n: number): Buffer {
    if (n > this.length) {
      throw new Error('Not enough data in buffer');
    }

    if (n === 0) {
      // Return empty buffer - use new Buffer for Node 0.8 compat
      return new Buffer(0);
    }

    // Allocate result buffer
    const result = new Buffer(n);
    let resultOffset = 0;
    let remaining = n;

    while (remaining > 0 && this.head) {
      const chunk = this.head.data;
      const available = chunk.length;

      if (available <= remaining) {
        // Consume entire chunk
        chunk.copy(result, resultOffset, 0, available);
        resultOffset += available;
        remaining -= available;
        this.length -= available;

        // Move to next node
        this.head = this.head.next;
        if (!this.head) {
          this.tail = null;
        }
      } else {
        // Consume partial chunk
        chunk.copy(result, resultOffset, 0, remaining);
        resultOffset += remaining;
        this.length -= remaining;

        // Keep remainder of chunk
        this.head.data = chunk.slice(remaining);
        remaining = 0;
      }
    }

    return result;
  }

  /**
   * Clear all buffered data
   */
  clear(): void {
    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  /**
   * Check if buffer has at least n bytes available
   */
  has(n: number): boolean {
    return this.length >= n;
  }
}
