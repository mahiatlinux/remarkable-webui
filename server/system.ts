import type { BatteryInfo, SystemAction, SystemInfo } from '../shared/types';
import { HttpError } from './http';
import { modelName, type Session } from './session';

const PROBE = [
	'echo @machine; cat /sys/devices/soc0/machine 2>/dev/null || tr -d "\\0" < /proc/device-tree/model 2>/dev/null; echo',
	'echo @serial; cat /sys/devices/soc0/serial_number 2>/dev/null || tr -d "\\0" < /proc/device-tree/serial-number 2>/dev/null; echo',
	'echo @os; cat /etc/os-release 2>/dev/null',
	'echo @update; cat /usr/share/remarkable/update.conf 2>/dev/null',
	'echo @hostname; hostname',
	'echo @uptime; cat /proc/uptime',
	'echo @mem; grep -E "^(MemTotal|MemAvailable):" /proc/meminfo',
	'echo @df; df -kP /home 2>/dev/null | tail -n1',
	'echo @battery; for d in /sys/class/power_supply/*; do [ -e "$d/type" ] || continue; echo "$(basename "$d")|$(cat "$d/type")|$(cat "$d/capacity" 2>/dev/null)|$(cat "$d/status" 2>/dev/null)|$(cat "$d/temp" 2>/dev/null)"; done',
	'echo @ip; ip -o -4 addr 2>/dev/null',
	'echo @ssid; iw dev 2>/dev/null | grep -m1 ssid',
	'echo @xochitl; systemctl is-active xochitl 2>/dev/null',
	'echo @webui; grep -i "^WebInterfaceEnabled" /home/root/.config/remarkable/xochitl.conf 2>/dev/null',
	'echo @date; date +%s'
].join('; ');

function sections(output: string): Map<string, string> {
	const result = new Map<string, string>();
	let current = '';
	for (const line of output.split('\n')) {
		if (line.startsWith('@')) {
			current = line.slice(1).trim();
			result.set(current, '');
		} else if (current) {
			result.set(current, `${result.get(current)}${line}\n`);
		}
	}
	return result;
}

function keyValue(text: string, key: string): string | null {
	const match = new RegExp(`^${key}=(.*)$`, 'm').exec(text);
	return match ? match[1].replace(/^"|"$/g, '').trim() : null;
}

function parseBattery(text: string): BatteryInfo {
	const batteries = text
		.split('\n')
		.map((entry) => entry.split('|'))
		.filter((fields) => fields[1] === 'Battery' && fields[2]);
	const line = batteries.find(([name]) => !name.includes('marker')) ?? batteries[0];
	if (!line) return { capacity: null, status: null, temperature: null };
	const [, , capacity, status, temp] = line;
	return {
		capacity: capacity ? Number(capacity) : null,
		status: status || null,
		temperature: temp ? Number(temp) / 10 : null
	};
}

export async function systemInfo(session: Session): Promise<SystemInfo> {
	const result = await session.exec(PROBE, { allowFailure: true });
	const parts = sections(result.stdout.toString('utf8'));
	const get = (key: string) => (parts.get(key) ?? '').trim();
	const machine = get('machine') || 'unknown';
	const os = get('os');
	const update = get('update');
	const [uptime] = get('uptime').split(' ');
	const mem = get('mem');
	const memTotal = /MemTotal:\s+(\d+)/.exec(mem);
	const memAvailable = /MemAvailable:\s+(\d+)/.exec(mem);
	const df = get('df').split(/\s+/).slice(-5);
	const addresses = get('ip')
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const fields = line.trim().split(/\s+/);
			return { iface: fields[1], address: fields[3]?.split('/')[0] ?? '' };
		})
		.filter((entry) => entry.iface !== 'lo' && entry.address);
	const webui = get('webui');
	return {
		machine,
		model: modelName(machine),
		serial: get('serial') || null,
		firmware: keyValue(update, 'REMARKABLE_RELEASE_VERSION') ?? keyValue(os, 'IMG_VERSION'),
		osName: keyValue(os, 'PRETTY_NAME'),
		hostname: get('hostname'),
		uptimeSeconds: Number(uptime) || 0,
		battery: parseBattery(get('battery')),
		storage:
			df.length === 5
				? { totalKb: Number(df[0]), usedKb: Number(df[1]), availableKb: Number(df[2]) }
				: null,
		memory:
			memTotal && memAvailable
				? { totalKb: Number(memTotal[1]), availableKb: Number(memAvailable[1]) }
				: null,
		addresses,
		wifiSsid: /ssid\s+(.+)/.exec(get('ssid'))?.[1]?.trim() ?? null,
		xochitlActive: get('xochitl') === 'active',
		webInterfaceEnabled: webui ? /true/i.test(webui) : null,
		usbConnected: addresses.some((entry) => entry.address.startsWith('10.11.99.')),
		deviceTime: Number(get('date')) * 1000 || Date.now()
	};
}

export async function runAction(session: Session, action: SystemAction) {
	if (action === 'restart-xochitl') return session.restartXochitl();
	if (action === 'reboot') {
		await session.exec('systemctl reboot', { allowFailure: true });
		session.disconnect();
		return;
	}
	if (action === 'poweroff') {
		await session.exec('systemctl poweroff', { allowFailure: true });
		session.disconnect();
		return;
	}
	throw new HttpError(400, 'Unknown action');
}
