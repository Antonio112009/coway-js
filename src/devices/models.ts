/** Data interfaces for Coway IoCare Purifiers. */

/** Device identification attributes for a Coway purifier. */
export interface DeviceAttributes {
  deviceId: string | null;
  model: string | null;
  modelCode: string | null;
  code: string | null;
  name: string | null;
  productName: string | null;
  placeId: string | null;
}

/** Detailed information about a single purifier filter/supply. */
export interface FilterInfo {
  name: string | null;
  filterRemain: number | null;
  filterRemainStatus: string | null;
  replaceCycle: number | null;
  replaceCycleUnit: string | null;
  lastDate: string | null;
  nextDate: string | null;
  pollutants: string[];
  description: string | null;
  preFilter: boolean;
  serverReset: boolean;
}

/** Minimal purifier identity returned by the devices list endpoint. */
export interface PurifierDeviceSummary {
  categoryName: string | null;
  deviceSerial: string;
  dvcNick: string;
  modelCode: string;
  placeId: string;
  productModel: string;
}

/** Rich device metadata from iocareapi user-devices endpoint. */
export interface UserDeviceInfo {
  barcode: string;
  dvcBrandCd: string;
  dvcTypeCd: string;
  prodName: string;
  ordNo: string;
  admdongCd: string;
  stationCd: string;
  resetDttm: string;
  membershipYn: string;
  selfManageYn: string;
  sellTypeCd: string;
  dvcNick?: string;
  dvcSerial?: string;
}

/** Raw supply payload returned by Coway's supplies endpoint. */
export interface FilterSupply {
  filterRemain?: number | null;
  filterRemainStatus?: string | null;
  lastDate?: string | null;
  nextDate?: string | null;
  pollutions?: { pollutionNm?: string | null }[];
  preFilterYn?: "Y" | "N" | null;
  replaceCycle?: number | null;
  replaceCycleUnit?: string | null;
  serverResetFilterYn?: "Y" | "N" | null;
  supplyContent?: string | null;
  supplyNm?: string | null;
}

/** Timer payload returned by Coway's timer endpoint. */
export interface PurifierTimerInfo {
  offTimer?: string | null;
}

/** Container for all purifier data. */
export interface PurifierData {
  purifiers: Record<string, CowayPurifier>;
}

/** Full state of a Coway IoCare Purifier. */
export interface CowayPurifier {
  deviceAttr: DeviceAttributes;
  mcuVersion: string | null;
  networkStatus: boolean | null;
  isOn: boolean | null;
  autoMode: boolean | null;
  ecoMode: boolean | null;
  nightMode: boolean | null;
  rapidMode: boolean | null;
  fanSpeed: number | null;
  lightOn: boolean | null;
  lightMode: number | null;
  buttonLock: number | null;
  timer: string | null;
  timerRemaining: number | null;
  preFilterPct: number | null;
  max2Pct: number | null;
  odorFilterPct: number | null;
  aqGrade: number | null;
  particulateMatter2_5: number | null;
  particulateMatter10: number | null;
  carbonDioxide: number | null;
  volatileOrganicCompounds: number | null;
  airQualityIndex: number | null;
  luxSensor: number | null;
  preFilterChangeFrequency: number | null;
  smartModeSensitivity: number | null;
  filters: FilterInfo[] | null;
}
