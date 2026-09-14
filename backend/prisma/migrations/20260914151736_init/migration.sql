-- CreateTable
CREATE TABLE "Animal" (
    "id" SERIAL NOT NULL,
    "tagNumber" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "breed" TEXT,
    "status" TEXT NOT NULL DEFAULT 'healthy',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Animal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Animal_tagNumber_key" ON "Animal"("tagNumber");
