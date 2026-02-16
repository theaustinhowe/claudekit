"use client";

import type { NetworkInfo } from "@devkit/gogo-shared";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@devkit/ui/components/card";
import { Skeleton } from "@devkit/ui/components/skeleton";
import { Check, Copy, QrCode, RefreshCw, Smartphone, Wifi } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { fetchNetworkInfo } from "@/lib/api";

export function ConnectDevice() {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const fetchInfo = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchNetworkInfo();
      if (response.data) {
        setNetworkInfo(response.data);
        // Auto-select the first IP
        if (response.data.ips.length > 0 && !selectedIp) {
          setSelectedIp(response.data.ips[0]);
        }
      } else if (response.error) {
        setError(response.error);
      }
    } catch (_err) {
      setError("Failed to fetch network information");
    } finally {
      setIsLoading(false);
    }
  }, [selectedIp]);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  const getUrl = (ip: string) => {
    const webPort = process.env.NEXT_PUBLIC_WEB_PORT || "2200";
    return `http://${ip}:${webPort}`;
  };

  const handleCopyUrl = async () => {
    if (!selectedIp) return;
    const url = getUrl(selectedIp);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-48 w-48" />
            <Skeleton className="h-4 w-48" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            <CardTitle>Connect Device</CardTitle>
          </div>
          <CardDescription>Scan the QR code to connect from another device</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchInfo}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!networkInfo || networkInfo.ips.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            <CardTitle>Connect Device</CardTitle>
          </div>
          <CardDescription>Scan the QR code to connect from another device</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <Wifi className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No local network addresses found.
              <br />
              Make sure you are connected to a network.
            </p>
            <Button variant="outline" size="sm" onClick={fetchInfo}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentUrl = selectedIp ? getUrl(selectedIp) : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          <CardTitle>Connect Device</CardTitle>
        </div>
        <CardDescription>Scan the QR code with your phone to access GoGo on the same WiFi network</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Network address selector */}
        {networkInfo.ips.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Multiple network addresses found. Select the one on your WiFi network:
            </p>
            <div className="flex flex-wrap gap-2">
              {networkInfo.ips.map((ip) => (
                <Badge
                  key={ip}
                  variant={selectedIp === ip ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setSelectedIp(ip)}
                >
                  {ip}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* QR Code */}
        {currentUrl && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="bg-white p-4 rounded-lg">
              <QRCodeSVG value={currentUrl} size={192} level="M" includeMargin={false} />
            </div>

            {/* URL display with copy button */}
            <div className="flex items-center gap-2 text-sm">
              <QrCode className="h-4 w-4 text-muted-foreground shrink-0" />
              <code className="bg-muted px-2 py-1 rounded font-mono text-sm">{currentUrl}</code>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopyUrl}>
                {copiedUrl ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="text-sm text-muted-foreground space-y-1 pt-2 border-t">
          <p className="font-medium text-foreground">To connect:</p>
          <ol className="list-decimal list-inside space-y-1 pl-1">
            <li>Ensure your phone is on the same WiFi network</li>
            <li>Open your phone's camera and scan the QR code</li>
            <li>Tap the link that appears to open GoGo</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
