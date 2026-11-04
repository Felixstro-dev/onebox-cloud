import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fsp from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

function parseSize(str) {
  if (!str || str === '') return 'Unbekannt';
  try {
    // lsblk gives strings like "465,8G" or "931,5G" (German locale with comma)
    const cleaned = String(str).replace(',', '.').trim();
    const match = cleaned.match(/([0-9.]+)\s*([KMGTPE]?)/i);
    if (!match) return 'Unbekannt';
    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase() || 'B';
    let bytes = val;
    switch (unit) {
      case 'G': bytes = val * 1024 * 1024 * 1024; break;
      case 'T': bytes = val * 1024 * 1024 * 1024 * 1024; break;
      case 'M': bytes = val * 1024 * 1024; break;
      case 'K': bytes = val * 1024; break;
      default: bytes = val; break;
    }
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024*1024*1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024*1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  } catch { return 'Unbekannt'; }
}

export async function listAvailableDrives() {
  const result = [];
  const seen = new Set();

  // Primary: lsblk --json (correctly parses German locale commas)
  try {
    const { stdout } = await execFileAsync('lsblk', ['-J', '-o', 'NAME,LABEL,SIZE,TYPE,MOUNTPOINT']);
    const data = JSON.parse(stdout);

    function processDevice(dev, parentMount) {
      const name = dev.name;
      const devicePath = `/dev/${name}`;
      if (seen.has(devicePath)) return;
      if (!dev.type || (dev.type !== 'disk' && dev.type !== 'part' && dev.type !== 'lvm')) return;

      // Skip loop devices and virtual
      if (name.startsWith('loop') || name.startsWith('dm-')) return;

      const label = dev.label || '';
      const mountpoint = dev.mountpoint || parentMount || '';
      const sizeStr = dev.size || '';

      result.push({
        path: devicePath,
        name: devicePath,
        size: parseSize(sizeStr),
        mountpoint,
        label,
        mountStatus: mountpoint ? (mountpoint === '/' || mountpoint.startsWith('/boot') || mountpoint === '/sys' ? 'System' : 'Mounted') : 'Unmounted',
        type: dev.type,
      });
      seen.add(devicePath);

      // Process children (partitions)
      if (dev.children && Array.isArray(dev.children)) {
        for (const child of dev.children) {
          processDevice(child, mountpoint);
        }
      }
    }

    if (data.blockdevices && Array.isArray(data.blockdevices)) {
      for (const dev of data.blockdevices) {
        processDevice(dev);
      }
    }
  } catch (error) {
    // Fallback to blkid
  }

  // Fallback / enrichment: blkid for labels
  try {
    const { stdout } = await execFileAsync('blkid', ['-o', 'export']);
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const deviceMatch = line.match(/^([^:]+):/);
      if (!deviceMatch) continue;
      const devicePath = deviceMatch[1];
      const labelMatch = line.match(/LABEL="([^"]*)"/);
      const label = labelMatch ? labelMatch[1] : '';
      const existing = result.find(r => r.path === devicePath);
      if (existing && label && !existing.label) {
        existing.label = label;
      } else if (!existing && devicePath.match(/^\/dev\/sd/)) {
        result.push({
          path: devicePath,
          name: devicePath,
          size: 'Unbekannt',
          mountpoint: '',
          label,
          mountStatus: 'Unmounted',
          type: 'part',
        });
        seen.add(devicePath);
      }
    }
  } catch { /* ignore */ }

  // Deduplicate, sort, return
  const unique = result.filter((r, i, arr) => arr.findIndex(x => x.path === r.path) === i);
  unique.sort((a, b) => a.name.localeCompare(b.name));
  return unique;
}

export async function mountDrive(source, target) {
  const mountSource = source || target;
  const mountTarget = path.resolve(String(target || ''));

  try {
    const stat = await fsp.stat(mountTarget);
    if (stat.isDirectory()) {
      await execFileAsync('mount', ['-t', 'auto', mountSource, mountTarget]);
      return { success: true, target: mountTarget, message: `Gemountet ${mountSource} → ${mountTarget}` };
    }
  } catch {
    await execFileAsync('mkdir', ['-p', mountTarget]);
  }

  try {
    await execFileAsync('mount', ['-t', 'auto', mountSource, mountTarget]);
    return { success: true, target: mountTarget, message: `Gemountet ${mountSource} → ${mountTarget}` };
  } catch (error) {
    return { success: false, target: mountTarget, message: `Mount fehlgeschlagen: ${error.message}` };
  }
}

export async function unmountDrive(mountpoint) {
  try {
    await execFileAsync('umount', [mountpoint]);
    return { success: true, message: `Umount ${mountpoint}` };
  } catch (error) {
    return { success: false, message: `Umount fehlgeschlagen: ${error.message}` };
  }
}
