"""Recurso solar: obtenção e preparo de dados climáticos horários (8760 h) para o PySAM.

Fontes suportadas
-----------------
* PVGIS (JRC/UE) – TMY por latitude/longitude (requer internet).
* Arquivo enviado pelo usuário – EPW, CSV do SAM, CSV do PVGIS ou CSV simples com GHI.
* Sintético – a partir de 12 médias mensais de GHI (kWh/m²/dia), sem internet.

Todos os caminhos produzem o mesmo formato: o dicionário ``solar_resource_data``
aceito por ``Pvsamv1.SolarResource`` (chaves lat, lon, tz, elev, year, month, day,
hour, minute, gh, dn, df, tdry, wspd).
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import pvlib

HOURS = 8760

# Médias mensais de GHI de Pelotas/RS (as mesmas do microgrid_optimizer.m)
GHI_MENSAL_PELOTAS = [5.5, 5.1, 4.3, 3.3, 2.5, 2.1, 2.3, 2.9, 3.6, 4.5, 5.2, 5.6]
TEMP_MENSAL_PELOTAS = [23.4, 23.2, 21.8, 18.6, 15.5, 12.8, 12.4, 13.6, 15.2, 17.8, 20.2, 22.4]


@dataclass
class WeatherData:
    lat: float
    lon: float
    tz: float
    elev: float
    ghi: np.ndarray
    dni: np.ndarray
    dhi: np.ndarray
    tdry: np.ndarray
    wspd: np.ndarray
    source: str
    month: np.ndarray = field(default_factory=lambda: _calendar()[0])
    day: np.ndarray = field(default_factory=lambda: _calendar()[1])
    hour: np.ndarray = field(default_factory=lambda: _calendar()[2])

    def to_sam(self) -> dict:
        n = HOURS
        return {
            "lat": float(self.lat),
            "lon": float(self.lon),
            "tz": float(self.tz),
            "elev": float(self.elev),
            "year": [2019] * n,
            "month": [int(x) for x in self.month],
            "day": [int(x) for x in self.day],
            "hour": [int(x) for x in self.hour],
            "minute": [30] * n,
            "gh": _clean(self.ghi),
            "dn": _clean(self.dni),
            "df": _clean(self.dhi),
            "tdry": [float(x) for x in np.nan_to_num(self.tdry, nan=20.0)],
            "wspd": [float(x) for x in np.nan_to_num(self.wspd, nan=2.0)],
        }

    def summary(self) -> dict:
        idx = self.month - 1
        ghi_month = np.bincount(idx, weights=self.ghi, minlength=12) / 1000.0
        days = np.bincount(idx, minlength=12) / 24.0
        temp_month = np.bincount(idx, weights=self.tdry, minlength=12) / np.maximum(1, np.bincount(idx, minlength=12))
        return {
            "fonte": self.source,
            "lat": round(float(self.lat), 4),
            "lon": round(float(self.lon), 4),
            "tz": float(self.tz),
            "elev": round(float(self.elev), 1),
            "ghi_anual_kwh_m2": round(float(self.ghi.sum() / 1000.0), 1),
            "ghi_mensal_kwh_m2_dia": [round(float(v), 2) for v in ghi_month / np.maximum(days, 1)],
            "temp_media_mensal_c": [round(float(v), 1) for v in temp_month],
            "temp_min_c": round(float(np.nanmin(self.tdry)), 1),
            "temp_max_c": round(float(np.nanmax(self.tdry)), 1),
        }


def _clean(a: np.ndarray) -> list:
    return [float(x) for x in np.clip(np.nan_to_num(a, nan=0.0), 0, None)]


def _calendar():
    idx = pd.date_range("2019-01-01", periods=HOURS, freq="h")
    return idx.month.values, idx.day.values, idx.hour.values


def _index(tz: float) -> pd.DatetimeIndex:
    # Ano não bissexto de referência, hora local padrão (sem horário de verão)
    tzname = f"Etc/GMT{'+' if tz <= 0 else '-'}{abs(int(round(tz)))}"
    return pd.date_range("2019-01-01", periods=HOURS, freq="h", tz=tzname)


def decompose_ghi(ghi: np.ndarray, lat: float, lon: float, tz: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Separa GHI em DNI e DHI pelo modelo de Erbs (pvlib), usando o meio da hora.

    Também saneia a série: zera GHI com o sol abaixo do horizonte (perfis sintéticos
    como o senoidal do Octave têm irradiância em horas sem sol), e perto do horizonte
    (zênite > 85°) trata toda a irradiância como difusa, evitando DNI irreais que
    fazem o SAM abortar. Retorna (ghi, dni, dhi).
    """
    idx = _index(tz) + pd.Timedelta("30min")
    sp = pvlib.solarposition.get_solarposition(idx, lat, lon)
    zen = sp["zenith"].to_numpy(float)
    ghi = np.where(zen < 90, np.clip(np.asarray(ghi, float), 0, None), 0.0)
    out = pvlib.irradiance.erbs(ghi, zen, idx.dayofyear.values)
    dni = np.nan_to_num(np.asarray(out["dni"], float))
    dhi = np.nan_to_num(np.asarray(out["dhi"], float))
    baixo = zen > 85
    dni = np.where(baixo, 0.0, np.clip(dni, 0, 1100.0))
    dhi = np.where(baixo, ghi, np.clip(ghi - dni * np.cos(np.radians(zen)), 0, None))
    return ghi, dni, dhi


def _fit_8760(df: pd.DataFrame) -> pd.DataFrame:
    """Remove 29/fev e garante 8760 linhas."""
    if len(df) == 8784:
        if isinstance(df.index, pd.DatetimeIndex):
            df = df[~((df.index.month == 2) & (df.index.day == 29))]
        else:
            df = pd.concat([df.iloc[: 59 * 24], df.iloc[60 * 24 :]])
    if len(df) != HOURS:
        raise ValueError(f"O arquivo deve ter 8760 (ou 8784) linhas horárias; encontrado {len(df)}.")
    return df


# ---------------------------------------------------------------- PVGIS
def _find_key(obj, key):
    """Procura uma chave em dicionários aninhados (o formato dos metadados do PVGIS varia)."""
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        for v in obj.values():
            found = _find_key(v, key)
            if found is not None:
                return found
    return None


def from_pvgis(lat: float, lon: float, timeout: int = 60) -> WeatherData:
    """Baixa o TMY do PVGIS (https://re.jrc.ec.europa.eu)."""
    res = pvlib.iotools.get_pvgis_tmy(lat, lon, map_variables=True, timeout=timeout)
    data = res[0]
    meta = res[-1] if isinstance(res[-1], dict) else (res[2] if len(res) > 2 else {})
    elev = float(_find_key(meta, "elevation") or 0)
    # PVGIS entrega em UTC; converter para hora local padrão (fuso aproximado pela longitude)
    tz = float(round(lon / 15.0))
    # hora local[i] = UTC[i - tz]  →  np.roll com deslocamento tz
    data = pd.DataFrame(np.roll(data.to_numpy(float), int(tz), axis=0), columns=data.columns)
    data = _fit_8760(data)
    return WeatherData(
        lat=lat,
        lon=lon,
        tz=tz,
        elev=elev,
        ghi=data["ghi"].to_numpy(float),
        dni=data["dni"].to_numpy(float),
        dhi=data["dhi"].to_numpy(float),
        tdry=data["temp_air"].to_numpy(float),
        wspd=data["wind_speed"].to_numpy(float),
        source=f"PVGIS TMY ({lat:.3f}, {lon:.3f})",
    )


# ---------------------------------------------------------------- arquivos
_ALIASES = {
    "ghi": ["ghi", "gh", "glo", "irradiacao_w_m2", "irradiacao", "irradiancia", "g(h)", "ghi_w_m2"],
    "dni": ["dni", "dn", "beam", "gb(n)"],
    "dhi": ["dhi", "df", "diffuse", "gd(h)"],
    "temp": ["tdry", "temp_air", "temperature", "temperatura", "t2m", "temp", "dry bulb temperature"],
    "wind": ["wspd", "wind_speed", "wind speed", "ws10m", "vento", "velocidade_vento"],
}


def _find(cols: list[str], key: str) -> str | None:
    low = {c.lower().strip(): c for c in cols}
    for a in _ALIASES[key]:
        if a in low:
            return low[a]
    for a in _ALIASES[key]:
        for lc, c in low.items():
            if lc.startswith(a):
                return c
    return None


def from_file(content: bytes, filename: str, lat: float | None, lon: float | None, tz: float | None,
              elev: float = 0.0) -> WeatherData:
    name = filename.lower()
    if name.endswith(".epw"):
        text = io.StringIO(content.decode("utf-8", errors="replace"))
        data, meta = pvlib.iotools.read_epw(text)
        data = _fit_8760(data)
        return WeatherData(
            lat=float(meta["latitude"]), lon=float(meta["longitude"]), tz=float(meta["TZ"]),
            elev=float(meta.get("altitude", 0)),
            ghi=data["ghi"].to_numpy(float), dni=data["dni"].to_numpy(float), dhi=data["dhi"].to_numpy(float),
            tdry=data["temp_air"].to_numpy(float), wspd=data["wind_speed"].to_numpy(float),
            source=f"EPW: {filename}",
        )

    text = content.decode("utf-8", errors="replace")
    lines = text.splitlines()
    # CSV do SAM / NSRDB: 2 linhas de cabeçalho com metadados
    head = lines[0].lower() if lines else ""
    if head.startswith("source") or head.startswith("latitude") or "location id" in head:
        keys = [k.strip() for k in lines[0].split(",")]
        vals = [v.strip() for v in lines[1].split(",")]
        meta = {k.lower(): v for k, v in zip(keys, vals)}
        lat = float(meta.get("latitude", lat or 0))
        lon = float(meta.get("longitude", lon or 0))
        tz = float(meta.get("time zone", meta.get("local time zone", tz or 0)))
        elev = float(meta.get("elevation", elev or 0))
        df = pd.read_csv(io.StringIO("\n".join(lines[2:])))
    else:
        # CSV do PVGIS tem linhas de metadados antes de "time(UTC)"
        start = next((i for i, l in enumerate(lines) if l.lower().startswith("time(utc)")), None)
        if start is not None:
            end = next((i for i in range(start + 1, len(lines)) if not lines[i][:1].isdigit()), len(lines))
            df = pd.read_csv(io.StringIO("\n".join(lines[start:end])))
            for l in lines[:start]:
                if l.lower().startswith("latitude"):
                    lat = float(l.split(":")[1])
                if l.lower().startswith("longitude"):
                    lon = float(l.split(":")[1])
            tz = float(round((lon or 0) / 15.0)) if tz is None else tz
            df = pd.DataFrame(np.roll(df.values, int(tz), axis=0), columns=df.columns)
        else:
            sep = ";" if lines and lines[0].count(";") > lines[0].count(",") else ","
            df = pd.read_csv(io.StringIO(text), sep=sep, decimal="," if sep == ";" else ".")

    if lat is None or lon is None:
        raise ValueError("Informe latitude e longitude para este arquivo.")
    tz = float(round(lon / 15.0)) if tz is None else float(tz)
    df = _fit_8760(df.reset_index(drop=True))
    cols = list(df.columns)
    cg, cn, cd, ct, cw = (_find(cols, k) for k in ("ghi", "dni", "dhi", "temp", "wind"))
    if cg is None:
        raise ValueError(f"Coluna de GHI não encontrada. Colunas: {cols}")
    ghi = pd.to_numeric(df[cg], errors="coerce").fillna(0).to_numpy(float)
    if cn is not None and cd is not None:
        dni = pd.to_numeric(df[cn], errors="coerce").fillna(0).to_numpy(float)
        dhi = pd.to_numeric(df[cd], errors="coerce").fillna(0).to_numpy(float)
        note = ""
    else:
        ghi, dni, dhi = decompose_ghi(ghi, lat, lon, tz)
        note = " (DNI/DHI por Erbs)"
    if ct is not None:
        tdry = pd.to_numeric(df[ct], errors="coerce").to_numpy(float)
    else:
        tdry = _synthetic_temperature(TEMP_MENSAL_PELOTAS, ghi)
        note += " (temperatura sintética)"
    wspd = pd.to_numeric(df[cw], errors="coerce").to_numpy(float) if cw is not None else np.full(HOURS, 2.0)
    return WeatherData(lat=lat, lon=lon, tz=tz, elev=elev, ghi=ghi, dni=dni, dhi=dhi, tdry=tdry,
                       wspd=wspd, source=f"Arquivo: {filename}{note}")


# ---------------------------------------------------------------- sintético
def _synthetic_temperature(temp_monthly: list[float], ghi: np.ndarray) -> np.ndarray:
    month, _, hour = _calendar()
    base = np.asarray(temp_monthly, float)[month - 1]
    # variação diária: mínimo ~6h, máximo ~15h, amplitude de 8 °C
    return base + 4.0 * np.sin(2 * np.pi * (hour - 9) / 24.0)


def synthetic(lat: float, lon: float, ghi_monthly: list[float], temp_monthly: list[float] | None = None,
              tz: float | None = None, elev: float = 0.0, seed: int = 42) -> WeatherData:
    """Gera 8760 h a partir das médias mensais de GHI (kWh/m²/dia).

    Usa o formato de céu claro (Ineichen) da pvlib e aplica um índice de
    nebulosidade diário aleatório (reprodutível) escalonado para que a média
    mensal coincida exatamente com o valor informado.
    """
    if len(ghi_monthly) != 12:
        raise ValueError("Informe 12 valores de GHI mensal.")
    tz = float(round(lon / 15.0)) if tz is None else float(tz)
    temp_monthly = temp_monthly or TEMP_MENSAL_PELOTAS
    idx = _index(tz)
    loc = pvlib.location.Location(lat, lon, tz=idx.tz, altitude=elev)
    cs = loc.get_clearsky(idx + pd.Timedelta("30min"), model="ineichen")["ghi"].to_numpy(float)
    rng = np.random.default_rng(seed)
    kday = np.clip(rng.normal(0.85, 0.25, 365), 0.15, 1.0)
    shape = cs * np.repeat(kday, 24)
    month = idx.month.values
    ghi = np.zeros(HOURS)
    for m in range(1, 13):
        sel = month == m
        days = sel.sum() / 24
        target = ghi_monthly[m - 1] * 1000.0 * days
        s = shape[sel].sum()
        ghi[sel] = shape[sel] * (target / s if s > 0 else 0)
    # limite físico (≈ céu claro) e re-escala para manter a média mensal
    ghi = np.minimum(ghi, cs * 1.1)
    for m in range(1, 13):
        sel = month == m
        target = ghi_monthly[m - 1] * 1000.0 * sel.sum() / 24
        s = ghi[sel].sum()
        if s > 0:
            ghi[sel] *= target / s
    ghi, dni, dhi = decompose_ghi(ghi, lat, lon, tz)
    tdry = _synthetic_temperature(temp_monthly, ghi)
    return WeatherData(lat=lat, lon=lon, tz=tz, elev=elev, ghi=ghi, dni=dni, dhi=dhi, tdry=tdry,
                       wspd=np.full(HOURS, 2.5), source="Sintético (médias mensais de GHI)")


def from_ghi_series(ghi: np.ndarray, lat: float, lon: float, tz: float | None = None,
                    temp_monthly: list[float] | None = None, source: str = "Série de GHI") -> WeatherData:
    tz = float(round(lon / 15.0)) if tz is None else float(tz)
    ghi, dni, dhi = decompose_ghi(np.asarray(ghi, float), lat, lon, tz)
    tdry = _synthetic_temperature(temp_monthly or TEMP_MENSAL_PELOTAS, ghi)
    return WeatherData(lat=lat, lon=lon, tz=tz, elev=0.0, ghi=ghi, dni=dni, dhi=dhi, tdry=tdry,
                       wspd=np.full(HOURS, 2.5), source=source + " (DNI/DHI por Erbs, temperatura sintética)")
