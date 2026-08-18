# Meter Reader

Lets neighbours view water usage from their own Neptune R900 meter, read over SDR with rtl_433, and warns them when their meter reports a leak.

## Language

### Devices and data

**Meter**:
A physical Neptune R900 water meter, identified by the 32-bit `id` in its radio transmission.
_Avoid_: Device, unit, sensor

**Reading**:
One decoded R900 transmission from a Meter, with the time it was received.
_Avoid_: Sample, packet, message, datapoint

**Consumption**:
The Meter's lifetime cumulative total in gallons. Only ever increases (until it wraps).
_Avoid_: Total, count, meter value

**Usage**:
Gallons consumed during a period, derived as the difference between two Consumption values.
_Avoid_: Consumption, delta, flow

**Heartbeat**:
A Reading stored despite being identical to the previous one, forced every 15 minutes so that a silent Meter is distinguishable from a Meter that is simply not using water.
_Avoid_: Keepalive, ping

**Stale**:
Describes a Meter that has not been heard from recently. Warned at 24 hours, treated as broken at 3 days.
_Avoid_: Offline, dead, silent

**Meter Event**:
A recorded transition of one of the Meter's flags — Active Leak, backflow or no-use — from one value to another. Kept forever, independently of the Readings it was derived from.
_Avoid_: Alert, notification, log

**Partial**:
Describes a period whose Usage is understated or overstated because Readings are missing near its boundaries.
_Avoid_: Incomplete, gap, estimated

### Leaks

**Active Leak**:
The meter's `leaknow` flag: water used in at least 50 of the last 96 fifteen-minute intervals (intermittent) or in every one of them (continuous). A rolling 24-hour assessment, not an event.
_Avoid_: Leak, LEAKNOW, leaking

**Leak History**:
The meter's `leak` field: a bucketed count of days on which a leak was seen (0=none, 1=1-2, 2=3-7, 3=8-14, 4=15-21, 5=22-34, 6=35+). A bucket, never an exact number of days.
_Avoid_: Leak days, leak count, LEAK

### Access

**Claim Code**:
A secret string that names exactly one Meter and proves the holder is entitled to see it. Issued by the Admin out of band. Permanent until rotated, reusable by everyone in a household.
_Avoid_: Access code, invite code, token, password

**Claim**:
The act of entering a Claim Code, which creates a Grant.
_Avoid_: Register, sign up, link

**Grant**:
One device's access to one Meter, created by a Claim and held as a signed cookie. Revocable individually by the Admin.
_Avoid_: Session, account, user, subscription

**Admin**:
The operator of the SDR and the app. Sees every Meter, issues and rotates Claim Codes, and revokes Grants.
_Avoid_: Owner, superuser
