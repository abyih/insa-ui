export function parseTimestamp(ts) {
	return new Date(ts).toLocaleString(); // Human-readable timestamp
}

// Helper to convert speed from bits per second to Mbps
export const toMbps = (bps) => bps / 1_000_000;

// Helper to format uptime duration
export const formatDuration = (duration) => {
	const { second = 0, nanosecond = 0 } = duration || {};
	return `${second}.${Math.floor((nanosecond / 1_000_000_000) * 1000)}s`;
};

export const formatBytes = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
export const formatSpeed = (mbps) => `${mbps} Mbps`;
export const formatDate = (date) => new Date(date).toLocaleString();
