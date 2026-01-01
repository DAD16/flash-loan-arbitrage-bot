import { ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

interface AddressProps {
  address: string;
  label?: string;
  truncate?: boolean;
  showCopy?: boolean;
  showLink?: boolean;
  chain?: string;
}

// Generate a blockie-style color based on address
function getAddressColor(address: string): string {
  if (!address || address.length < 10) {
    return 'hsl(0, 0%, 50%)'; // Default gray for invalid addresses
  }
  const hash = address.toLowerCase().slice(2, 8);
  const hue = parseInt(hash, 16) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

export default function Address({
  address,
  label,
  truncate = true,
  showCopy = true,
  showLink = true,
  chain = 'bsc',
}: AddressProps) {
  const [copied, setCopied] = useState(false);

  // Ensure address is valid before processing
  const safeAddress = address || '0x0000000000000000000000000000000000000000';
  const displayAddress = truncate && safeAddress.length >= 10
    ? `${safeAddress.slice(0, 6)}...${safeAddress.slice(-4)}`
    : safeAddress;

  const explorerUrls: Record<string, string> = {
    bsc: 'https://bscscan.com/address/',
    ethereum: 'https://etherscan.io/address/',
    arbitrum: 'https://arbiscan.io/address/',
    optimism: 'https://optimistic.etherscan.io/address/',
    base: 'https://basescan.org/address/',
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(safeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const explorerUrl = (explorerUrls[chain] || explorerUrls.bsc) + safeAddress;

  return (
    <div className="flex items-center gap-2">
      {/* Blockie Avatar */}
      <div
        className="w-6 h-6 rounded-full flex-shrink-0"
        style={{ backgroundColor: getAddressColor(safeAddress) }}
      />

      {/* Address/Label */}
      <div className="flex flex-col min-w-0">
        {label && (
          <span className="text-sm font-medium text-matrix-text truncate">
            {label}
          </span>
        )}
        <span
          className={clsx(
            'font-mono text-matrix-text-muted',
            label ? 'text-xs' : 'text-sm'
          )}
        >
          {displayAddress}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 ml-auto">
        {showCopy && (
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-matrix-surface-hover rounded transition-colors"
            title="Copy address"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-matrix-success" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-matrix-text-muted" />
            )}
          </button>
        )}
        {showLink && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-matrix-surface-hover rounded transition-colors"
            title="View on explorer"
          >
            <ExternalLink className="w-3.5 h-3.5 text-matrix-text-muted" />
          </a>
        )}
      </div>
    </div>
  );
}

// Transaction hash display
export function TxHash({
  hash,
  chain = 'bsc',
}: {
  hash?: string | null;
  chain?: string;
}) {
  const [copied, setCopied] = useState(false);

  // Handle null/undefined hash
  const safeHash = hash || '0x0000000000000000000000000000000000000000000000000000000000000000';
  const displayHash = safeHash.length >= 18
    ? `${safeHash.slice(0, 10)}...${safeHash.slice(-8)}`
    : safeHash;

  const explorerUrls: Record<string, string> = {
    bsc: 'https://bscscan.com/tx/',
    ethereum: 'https://etherscan.io/tx/',
    arbitrum: 'https://arbiscan.io/tx/',
    optimism: 'https://optimistic.etherscan.io/tx/',
    base: 'https://basescan.org/tx/',
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(safeHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1">
      <a
        href={(explorerUrls[chain] || explorerUrls.bsc) + safeHash}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-sm text-blue-400 hover:text-blue-300 transition-colors"
      >
        {displayHash}
      </a>
      <button
        onClick={handleCopy}
        className="p-1 hover:bg-matrix-surface-hover rounded transition-colors"
      >
        {copied ? (
          <Check className="w-3 h-3 text-matrix-success" />
        ) : (
          <Copy className="w-3 h-3 text-matrix-text-muted" />
        )}
      </button>
    </div>
  );
}
