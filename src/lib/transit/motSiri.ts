import type { Arrival } from "./types";

/**
 * Live arrivals from the Israel Ministry of Transport SIRI Stop Monitoring
 * service. Enabled only when MOT_SIRI_API_KEY is configured.
 *
 * NOTE: MoT onboarding (ptsupport@mot.gov.il) issues a user code and confirms
 * the exact endpoint. The request below follows the SIRI 2.0 StopMonitoring
 * SOAP shape with the user code passed as RequestorRef. Verify the envelope
 * against your onboarding documentation — callers fall back to the published
 * schedule if this request fails, so a mismatch degrades gracefully.
 */
export function isSiriConfigured(): boolean {
  return Boolean(process.env.MOT_SIRI_API_KEY);
}

const ENDPOINT =
  process.env.MOT_SIRI_ENDPOINT ??
  "http://siri.motrealtime.co.il:8081/Siri/SiriServices";

function buildEnvelope(stopCode: number, requestorRef: string): string {
  const ts = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Siri xmlns="http://www.siri.org.uk/siri" version="2.0">
      <ServiceRequest>
        <RequestTimestamp>${ts}</RequestTimestamp>
        <RequestorRef>${requestorRef}</RequestorRef>
        <StopMonitoringRequest version="2.0">
          <RequestTimestamp>${ts}</RequestTimestamp>
          <MonitoringRef>${stopCode}</MonitoringRef>
        </StopMonitoringRequest>
      </ServiceRequest>
    </Siri>
  </soap:Body>
</soap:Envelope>`;
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}>([^<]*)</`, "i"));
  return m ? m[1].trim() : null;
}

function parseVisits(xml: string, now: Date): Arrival[] {
  const out: Arrival[] = [];
  const visits = xml.match(
    /<(?:\w+:)?MonitoredStopVisit>[\s\S]*?<\/(?:\w+:)?MonitoredStopVisit>/g
  );
  if (!visits) return out;
  for (const v of visits) {
    const line = tag(v, "PublishedLineName") ?? tag(v, "LineRef") ?? "";
    const destination = tag(v, "DestinationName") ?? "";
    const agency = tag(v, "OperatorRef") ?? "";
    const arrivalTime =
      tag(v, "ExpectedArrivalTime") ?? tag(v, "AimedArrivalTime");
    if (!arrivalTime) continue;
    const arrival = new Date(arrivalTime);
    out.push({
      line,
      destination,
      agency,
      arrivalTime: arrival.toISOString(),
      minutesAway: Math.round((arrival.getTime() - now.getTime()) / 60_000),
      live: true,
    });
  }
  return out.sort((a, b) => a.minutesAway - b.minutesAway);
}

export async function getSiriArrivals(stopCode: number): Promise<Arrival[]> {
  const key = process.env.MOT_SIRI_API_KEY;
  if (!key) throw new Error("MOT_SIRI_API_KEY not configured");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: buildEnvelope(stopCode, key),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`SIRI HTTP ${res.status}`);
  const xml = await res.text();
  return parseVisits(xml, new Date());
}
