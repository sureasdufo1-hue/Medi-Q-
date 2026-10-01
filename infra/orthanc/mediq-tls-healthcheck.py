#!/usr/bin/env python3
"""Certificate-validating health probe for the isolated local Test Orthanc."""

import ssl
import sys
import urllib.error
import urllib.request


def main() -> int:
    if len(sys.argv) != 2:
        return 2

    context = ssl.create_default_context(cafile=sys.argv[1])
    request = urllib.request.Request("https://localhost:8042/system", method="GET")
    try:
        with urllib.request.urlopen(request, timeout=3, context=context) as response:
            return 0 if response.status == 200 else 1
    except urllib.error.HTTPError as error:
        # Orthanc requires authentication; a verified 401 proves TLS and liveness.
        return 0 if error.code == 401 else 1
    except (OSError, ssl.SSLError, urllib.error.URLError):
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
