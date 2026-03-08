/** Shared test fixtures mirroring pycoway conftest.py */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;

export function sampleDevice(): JsonObject {
  return {
    deviceSerial: "ABC123",
    productModel: "AIRMEGA-250S",
    dvcNick: "Living Room",
    placeId: "place-001",
  };
}

export function sampleUserDevice() {
  return {
    barcode: "ABC123",
    dvcBrandCd: "CW",
    dvcTypeCd: "001",
    prodName: "AIRMEGA 250S",
    ordNo: "ORD-001",
    admdongCd: "1168010100",
    stationCd: "111123",
    resetDttm: "20240101120000",
    membershipYn: "N",
    selfManageYn: "N",
    sellTypeCd: "Z01",
    dvcNick: "Living Room",
    dvcSerial: "ABC123",
  };
}

export function sampleControlResponse(): JsonObject {
  return {
    controlStatus: {
      "0001": "1",
      "0002": "1",
      "0003": "2",
      "0007": "2",
      "0008": "0",
      "000A": "3",
      "0024": "0",
    },
    netStatus: {
      isOnline: "Y",
    },
  };
}

export function sampleAirHomeResponse(): JsonObject {
  return {
    IAQ: {
      dustpm25: "15",
      dustpm10: "25",
      co2: "450",
      vocs: "10",
      iaqIndex: "50",
      iaqGrade: "1",
    },
    prodStatus: {
      power: "1",
      airVolume: "2",
      dustPollution: "4",
    },
    filterList: [],
    netStatus: {
      isOnline: "Y",
    },
  };
}

export function sampleParsedInfo() {
  return {
    deviceInfo: {
      productName: "AIRMEGA 250S",
      modelCode: "MC-250S",
      prodName: "Airmega 250S",
    },
    mcuInfo: {
      currentMcuVer: "2.0.1",
    },
    networkInfo: {
      wifiConnected: true,
    },
    sensorInfo: {
      "0001": 15,
      "0002": 25,
      "0007": 300,
      "0011": 20,
      "0012": 30,
      "0013": 40,
      CO2_IDX: 450,
      VOCs_IDX: 10,
      IAQ: 50,
    },
    statusInfo: {
      "0001": 1,
      "0002": 1,
      "0003": 2,
      "0004": 0,
      "0005": 0,
      "0006": 0,
      "0007": 2,
      "0008": 0,
      "0024": 0,
      "000A": 3,
    },
    aqGrade: {
      iaqGrade: 1,
    },
    filterInfo: {
      "pre-filter": { filterRemain: 80, replaceCycle: 112 },
      max2: { filterRemain: 65 },
    },
    timerInfo: null,
  };
}

export function samplePurifierJsonChildren(): JsonObject {
  return {
    children: [
      {
        coreData: [
          {
            data: {
              currentMcuVer: "2.0.1",
              sensorInfo: {
                attributes: {
                  "0001": 15,
                  "0002": 25,
                  "0007": 300,
                  "0011": 20,
                  "0012": 30,
                  "0013": 40,
                  CO2_IDX: 450,
                  VOCs_IDX: 10,
                  IAQ: 50,
                },
              },
            },
          },
        ],
        deviceStatusData: {
          data: {
            statusInfo: {
              attributes: {
                "0001": 1,
                "0002": 1,
                "0003": 2,
                "0007": 2,
                "0008": 0,
                "0024": 0,
                "000A": 3,
              },
            },
          },
        },
        baseInfoForModelCodeData: {
          deviceInfo: {
            productName: "AIRMEGA 250S",
            modelCode: "MC-250S",
            prodName: "Airmega 250S",
          },
        },
        deviceModule: {
          data: {
            content: {
              deviceModuleDetailInfo: {
                wifiConnected: true,
                airStatusInfo: { iaqGrade: 1 },
              },
            },
          },
        },
      },
    ],
  };
}
