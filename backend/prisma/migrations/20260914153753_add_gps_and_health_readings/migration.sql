-- CreateTable
CREATE TABLE "GpsReading" (
    "id" SERIAL NOT NULL,
    "animalId" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "outsideFence" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GpsReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthReading" (
    "id" SERIAL NOT NULL,
    "animalId" INTEGER NOT NULL,
    "temperatureC" DOUBLE PRECISION NOT NULL,
    "alert" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthReading_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GpsReading" ADD CONSTRAINT "GpsReading_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthReading" ADD CONSTRAINT "HealthReading_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
