# Usage is derived from stored readings, never interpolated

Consumption is normalised to gallons at ingest (the R900 counter's last digit is tenths, so raw/10) and stored per Reading; Usage for a period is the last Reading in it minus the last Reading before it starts, bucketed in America/Chicago from UTC timestamps so DST is handled at query time. Readings arrive irregularly and the dongle can be down, so a period whose boundary Readings are too far apart is marked Partial rather than filled in — an invented number shown to a neighbour as fact is worse than an honest gap.

A Reading whose Consumption is lower than the last stored one for that Meter is rejected and reported to Sentry, since Consumption only decreases when the counter wraps, the meter is swapped, or the packet is corrupt — all of which need a human. No upper bound is enforced: a genuinely large jump is indistinguishable from a filled pool.
