"""HTTP client for the inventory service's reservation API."""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class InventoryUnavailable(Exception):
    """The inventory service could not be reached or failed. Safe to retry."""


class InventoryRejected(Exception):
    """The inventory service refused the request, such as an unknown store or SKU."""


class OutOfStock(InventoryRejected):
    def __init__(self, sku: str, requested: int, available: int):
        super().__init__(f"Only {available} left of {sku}, {requested} requested")
        self.sku = sku
        self.requested = requested
        self.available = available


class InventoryClient:
    def __init__(self, base_url: str, timeout: float = 3.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.http = requests.Session()
        # Reservations are keyed by order ID, so retrying even a POST can never reserve twice.
        retries = Retry(
            total=2,
            backoff_factor=0.2,
            status_forcelist=(502, 503, 504),
            allowed_methods=None,
            raise_on_status=False,
        )
        self.http.mount("http://", HTTPAdapter(max_retries=retries))
        self.http.mount("https://", HTTPAdapter(max_retries=retries))

    def reserve(self, order_ref: str, store_code: str, lines: list[dict]) -> dict:
        body = {"orderRef": order_ref, "storeCode": store_code, "lines": lines}
        response = self._send("POST", "/api/reservations", json=body)
        if response.status_code in (200, 201):
            return response.json()
        problem = _problem(response)
        if response.status_code == 409:
            raise OutOfStock(problem.get("sku"), problem.get("requested"), problem.get("available"))
        if response.status_code in (400, 404):
            raise InventoryRejected(problem.get("detail") or "Inventory rejected the order")
        raise InventoryUnavailable(f"Inventory service answered {response.status_code}")

    def release(self, reservation_id: str) -> dict:
        response = self._send("POST", f"/api/reservations/{reservation_id}/release")
        if response.status_code == 200:
            return response.json()
        if response.status_code == 404:
            raise InventoryRejected(_problem(response).get("detail") or "Reservation not found")
        raise InventoryUnavailable(f"Inventory service answered {response.status_code}")

    def _send(self, method: str, path: str, **kwargs) -> requests.Response:
        try:
            return self.http.request(method, self.base_url + path, timeout=self.timeout, **kwargs)
        except requests.RequestException as exc:
            raise InventoryUnavailable(f"Inventory service unreachable: {exc}") from exc


def _problem(response: requests.Response) -> dict:
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}
