#define _FILE_OFFSET_BITS 64
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/uio.h>
#include <time.h>
#include <unistd.h>

enum format { BGRA, RGB565, GRAY16, GRAY8 };

#define SAMPLE_STEP 6
#define MAX_IOV 1024

static int parse_format(const char *name) {
	if (!strcmp(name, "bgra")) return BGRA;
	if (!strcmp(name, "rgb565")) return RGB565;
	if (!strcmp(name, "gray16")) return GRAY16;
	if (!strcmp(name, "gray8")) return GRAY8;
	return -1;
}

static int bytes_per_pixel(int format) {
	switch (format) {
		case BGRA: return 4;
		case RGB565: return 2;
		case GRAY16: return 2;
		default: return 1;
	}
}

static void convert_row(const uint8_t *src, uint8_t *dst, int width, int format, int channels) {
	for (int x = 0; x < width; x++) {
		uint8_t r, g, b;
		switch (format) {
			case BGRA:
				b = src[x * 4];
				g = src[x * 4 + 1];
				r = src[x * 4 + 2];
				break;
			case RGB565: {
				uint16_t v = (uint16_t)(src[x * 2] | (src[x * 2 + 1] << 8));
				r = (uint8_t)(((v >> 11) & 31) << 3);
				g = (uint8_t)(((v >> 5) & 63) << 2);
				b = (uint8_t)((v & 31) << 3);
				break;
			}
			case GRAY16: {
				unsigned v = ((unsigned)src[x * 2] << 8 | src[x * 2 + 1]) >> 5;
				r = g = b = (uint8_t)(v > 255 ? 255 : v);
				break;
			}
			default:
				r = g = b = src[x];
		}
		if (channels == 1) {
			dst[x] = g;
		} else {
			dst[x * 3] = r;
			dst[x * 3 + 1] = g;
			dst[x * 3 + 2] = b;
		}
	}
}

static size_t rle_encode(const uint8_t *src, size_t pixels, int channels, uint8_t *out) {
	size_t written = 0;
	size_t i = 0;
	while (i < pixels) {
		const uint8_t *value = src + i * channels;
		size_t run = 1;
		while (run < 255 && i + run < pixels && !memcmp(value, src + (i + run) * channels, channels)) run++;
		out[written++] = (uint8_t)run;
		memcpy(out + written, value, channels);
		written += channels;
		i += run;
	}
	return written;
}

static int write_all(const void *data, size_t length) {
	const uint8_t *bytes = data;
	while (length) {
		ssize_t n = write(STDOUT_FILENO, bytes, length);
		if (n < 0) {
			if (errno == EINTR) continue;
			return -1;
		}
		bytes += n;
		length -= (size_t)n;
	}
	return 0;
}

struct source {
	int fd;
	pid_t pid;
	off_t offset;
	size_t row_bytes;
	uint8_t *forced;
};

static int pread_rows(const struct source *src, uint8_t *dst, int first, int count) {
	size_t length = src->row_bytes * (size_t)count;
	off_t start = src->offset + (off_t)first * (off_t)src->row_bytes;
	size_t done = 0;
	while (done < length) {
		ssize_t n = pread(src->fd, dst + (size_t)first * src->row_bytes + done, length - done, start + (off_t)done);
		if (n <= 0) {
			if (n < 0 && errno == EINTR) continue;
			return -1;
		}
		done += (size_t)n;
	}
	return 0;
}

static int read_rows(const struct source *src, uint8_t *dst, int first, int count) {
	if (!src->pid) return pread_rows(src, dst, first, count);
	size_t length = src->row_bytes * (size_t)count;
	struct iovec local = { dst + (size_t)first * src->row_bytes, length };
	struct iovec remote = { (void *)(uintptr_t)(src->offset + (off_t)first * (off_t)src->row_bytes), length };
	ssize_t n = process_vm_readv(src->pid, &local, 1, &remote, 1, 0);
	if (n == (ssize_t)length) return 0;
	int done = n > 0 ? (int)((size_t)n / src->row_bytes) : 0;
	return pread_rows(src, dst, first + done, count - done);
}

static int read_samples(const struct source *src, uint8_t *dst, int height) {
	struct iovec local[MAX_IOV];
	struct iovec remote[MAX_IOV];
	int rows[MAX_IOV];
	int y = 0;
	while (y < height) {
		int count = 0;
		while (y < height && count < MAX_IOV) {
			if (src->pid && !src->forced[y]) {
				local[count].iov_base = dst + (size_t)y * src->row_bytes;
				local[count].iov_len = src->row_bytes;
				remote[count].iov_base = (void *)(uintptr_t)(src->offset + (off_t)y * (off_t)src->row_bytes);
				remote[count].iov_len = src->row_bytes;
				rows[count] = y;
				count++;
			} else if (pread_rows(src, dst, y, 1)) {
				return -1;
			}
			y += SAMPLE_STEP;
		}
		int done = 0;
		while (done < count) {
			ssize_t n = process_vm_readv(src->pid, local + done, count - done, remote + done, count - done, 0);
			int complete = n > 0 ? (int)((size_t)n / src->row_bytes) : 0;
			done += complete;
			if (done < count) {
				src->forced[rows[done]] = 1;
				if (pread_rows(src, dst, rows[done], 1)) return -1;
				done++;
			}
		}
	}
	return 0;
}

static long now_ms(void) {
	struct timespec ts;
	clock_gettime(CLOCK_MONOTONIC, &ts);
	return ts.tv_sec * 1000L + ts.tv_nsec / 1000000L;
}

static void sleep_ms(int ms) {
	struct timespec pause = { ms / 1000, (ms % 1000) * 1000000L };
	nanosleep(&pause, NULL);
}

struct frame {
	int width;
	int height;
	int format;
	int channels;
	size_t raw_row;
	size_t row_bytes;
	uint8_t *raw;
	uint8_t *known;
	uint8_t *pixels;
	uint8_t *scratch;
};

static int send_rows(const struct frame *f, int y0, int rows) {
	size_t length = rle_encode(f->pixels + (size_t)y0 * f->row_bytes, (size_t)rows * f->width, f->channels, f->scratch);
	uint8_t header[8] = {
		(uint8_t)y0, (uint8_t)(y0 >> 8), (uint8_t)rows, (uint8_t)(rows >> 8),
		(uint8_t)length, (uint8_t)(length >> 8), (uint8_t)(length >> 16), (uint8_t)(length >> 24)
	};
	if (write_all(header, sizeof header)) return -1;
	return write_all(f->scratch, length);
}

static int row_changed(const struct frame *f, int y) {
	return memcmp(f->raw + (size_t)y * f->raw_row, f->known + (size_t)y * f->raw_row, f->raw_row) != 0;
}

static void accept_row(struct frame *f, int y) {
	memcpy(f->known + (size_t)y * f->raw_row, f->raw + (size_t)y * f->raw_row, f->raw_row);
	convert_row(f->raw + (size_t)y * f->raw_row, f->pixels + (size_t)y * f->row_bytes, f->width, f->format, f->channels);
}

static int publish_band(struct frame *f, int first, int end) {
	int y = first;
	while (y < end) {
		if (!row_changed(f, y)) {
			y++;
			continue;
		}
		int start = y;
		int clean = 0;
		while (y < end && clean < 4) {
			if (row_changed(f, y)) clean = 0;
			else clean++;
			y++;
		}
		int stop = y - clean;
		for (int row = start; row < stop; row++) accept_row(f, row);
		if (send_rows(f, start, stop - start)) return -1;
	}
	return 0;
}

int main(int argc, char **argv) {
	if (argc < 8) {
		fprintf(stderr, "usage: rmfb <file> <offset> <width> <height> <stride> <bgra|rgb565|gray16|gray8> <channels> [active_ms] [idle_ms]\n");
		return 64;
	}
	struct frame f = { 0 };
	struct source src = { 0 };
	const char *path = argv[1];
	src.offset = (off_t)strtoull(argv[2], NULL, 10);
	f.width = atoi(argv[3]);
	f.height = atoi(argv[4]);
	int stride = atoi(argv[5]);
	f.format = parse_format(argv[6]);
	f.channels = atoi(argv[7]);
	int active_ms = argc > 8 ? atoi(argv[8]) : 8;
	int idle_ms = argc > 9 ? atoi(argv[9]) : 30;
	if (f.format < 0 || f.width <= 0 || f.height <= 0 || stride < f.width || (f.channels != 1 && f.channels != 3)) {
		fprintf(stderr, "rmfb: invalid arguments\n");
		return 64;
	}
	signal(SIGPIPE, SIG_DFL);
	unsigned long pid = 0;
	if (sscanf(path, "/proc/%lu/mem", &pid) == 1) src.pid = (pid_t)pid;
	src.fd = open(path, O_RDONLY);
	if (src.fd < 0) {
		fprintf(stderr, "rmfb: cannot open %s: %s\n", path, strerror(errno));
		return 1;
	}
	f.raw_row = (size_t)stride * bytes_per_pixel(f.format);
	f.row_bytes = (size_t)f.width * f.channels;
	src.row_bytes = f.raw_row;
	src.forced = calloc((size_t)f.height, 1);
	f.raw = malloc(f.raw_row * f.height);
	f.known = malloc(f.raw_row * f.height);
	f.pixels = malloc(f.row_bytes * f.height);
	f.scratch = malloc(f.row_bytes * f.height * 2 + (size_t)f.height * 4);
	if (!src.forced || !f.raw || !f.known || !f.pixels || !f.scratch) {
		fprintf(stderr, "rmfb: out of memory\n");
		return 1;
	}
	uint8_t magic[10] = {
		'R', 'M', 'F', 'B', 1, (uint8_t)f.channels,
		(uint8_t)f.width, (uint8_t)(f.width >> 8), (uint8_t)f.height, (uint8_t)(f.height >> 8)
	};
	if (write_all(magic, sizeof magic)) return 0;
	if (read_rows(&src, f.raw, 0, f.height)) {
		fprintf(stderr, "rmfb: framebuffer read failed: %s\n", strerror(errno));
		return 2;
	}
	for (int y = 0; y < f.height; y++) accept_row(&f, y);
	if (send_rows(&f, 0, f.height)) return 0;
	long last_change = now_ms();
	long last_full = last_change;
	long last_write = last_change;
	for (;;) {
		long now = now_ms();
		int active = now - last_change < 600;
		int changed = 0;
		if (now - last_write >= 1000) {
			uint8_t heartbeat[8] = { 0 };
			if (write_all(heartbeat, sizeof heartbeat)) return 0;
			last_write = now;
		}
		if (now - last_full >= (active ? 250 : 1000)) {
			if (read_rows(&src, f.raw, 0, f.height)) {
				fprintf(stderr, "rmfb: framebuffer read failed: %s\n", strerror(errno));
				return 2;
			}
			last_full = now;
			for (int y = 0; y < f.height; y++) {
				if (row_changed(&f, y)) {
					changed = 1;
					break;
				}
			}
			if (changed && publish_band(&f, 0, f.height)) return 0;
		} else {
			if (read_samples(&src, f.raw, f.height)) {
				fprintf(stderr, "rmfb: framebuffer read failed: %s\n", strerror(errno));
				return 2;
			}
			int y = 0;
			while (y < f.height) {
				if (!row_changed(&f, y)) {
					y += SAMPLE_STEP;
					continue;
				}
				int first = y - SAMPLE_STEP + 1 < 0 ? 0 : y - SAMPLE_STEP + 1;
				int end = y;
				while (end < f.height && row_changed(&f, end)) end += SAMPLE_STEP;
				end = end + SAMPLE_STEP > f.height ? f.height : end + SAMPLE_STEP;
				if (read_rows(&src, f.raw, first, end - first)) {
					fprintf(stderr, "rmfb: framebuffer read failed: %s\n", strerror(errno));
					return 2;
				}
				if (publish_band(&f, first, end)) return 0;
				changed = 1;
				y = end;
			}
		}
		if (changed) last_change = last_write = now;
		sleep_ms(active ? active_ms : idle_ms);
	}
}
