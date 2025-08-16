-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: localhost    Database: delicute_db
-- ------------------------------------------------------
-- Server version	8.0.41

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `addresses`
--

DROP TABLE IF EXISTS `addresses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `addresses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `label` varchar(100) DEFAULT NULL,
  `pincode` varchar(6) NOT NULL,
  `city` varchar(50) NOT NULL,
  `state` varchar(50) NOT NULL,
  `line1` text NOT NULL,
  `houseNo` varchar(50) DEFAULT NULL,
  `floorNo` varchar(50) DEFAULT NULL,
  `towerNo` varchar(50) DEFAULT NULL,
  `building` varchar(100) DEFAULT NULL,
  `receiver_name` varchar(100) NOT NULL,
  `receiver_phone` varchar(15) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `addresses_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `addresses`
--

LOCK TABLES `addresses` WRITE;
/*!40000 ALTER TABLE `addresses` DISABLE KEYS */;
INSERT INTO `addresses` VALUES (18,15,'Kanigiri ','523230','Kanigiri ','Andhra Pradesh ','Addaroad ','','','','','SUBBARAO ','8309492772','2025-07-21 04:24:23','2025-07-21 04:24:23'),(21,13,'Alliance university ','523230','Anekal','Karnataka ','Vbhc','3-119','1','','12th block 207','Vasu ','9652296548','2025-08-13 13:56:00','2025-08-13 13:56:00'),(25,10,'Alliance university ','562106','Anekal ','Karnataka ','Hanvi pg ','','','','','Vasu','9652296548','2025-08-16 06:17:02','2025-08-16 06:17:02');
/*!40000 ALTER TABLE `addresses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `banners`
--

DROP TABLE IF EXISTS `banners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `banners` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `desc` text NOT NULL,
  `image` varchar(255) NOT NULL,
  `startDate` datetime NOT NULL,
  `endDate` datetime NOT NULL,
  `active` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `banners`
--

LOCK TABLES `banners` WRITE;
/*!40000 ALTER TABLE `banners` DISABLE KEYS */;
INSERT INTO `banners` VALUES (10,'FREE DELIVERY 🚚',' ','1755279432486-banner.jpg','2025-08-15 22:52:29','2025-08-31 22:52:00',1);
/*!40000 ALTER TABLE `banners` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cart_coupons`
--

DROP TABLE IF EXISTS `cart_coupons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cart_coupons` (
  `user_id` int NOT NULL,
  `coupon_code` varchar(30) DEFAULT NULL,
  `discount` int DEFAULT '0',
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cart_coupons`
--

LOCK TABLES `cart_coupons` WRITE;
/*!40000 ALTER TABLE `cart_coupons` DISABLE KEYS */;
/*!40000 ALTER TABLE `cart_coupons` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cart_items`
--

DROP TABLE IF EXISTS `cart_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cart_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `menu_item_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `name` varchar(255) DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `image_url` text,
  `category_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_item` (`user_id`,`menu_item_id`),
  UNIQUE KEY `uniq_user_item` (`user_id`,`menu_item_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `cart_items_ibfk_1` (`menu_item_id`),
  CONSTRAINT `cart_items_ibfk_1` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cart_items_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_menu_item_id` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items` (`id`),
  CONSTRAINT `fk_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=336 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cart_items`
--

LOCK TABLES `cart_items` WRITE;
/*!40000 ALTER TABLE `cart_items` DISABLE KEYS */;
INSERT INTO `cart_items` VALUES (332,13,16,1,'2025-08-15 17:09:08','2025-08-15 17:09:08','ONION/TOMATO REGULAR',109.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479629/menu_items/oniontomatovegpizza.webp',4),(335,10,110,1,'2025-08-16 06:33:56','2025-08-16 06:33:56','OREO THUNDER WITH ICE CREAM',169.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754675729/menu_items/OREO%20THUNDER%20WITH%20ICE%20CREAM.jpg',11);
/*!40000 ALTER TABLE `cart_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `categories`
--

DROP TABLE IF EXISTS `categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` text,
  `image` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `categories`
--

LOCK TABLES `categories` WRITE;
/*!40000 ALTER TABLE `categories` DISABLE KEYS */;
INSERT INTO `categories` VALUES (1,'Milk Shakes',NULL,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755180725/npye6vk3dzotk5swm9td.jpg','2025-08-14 06:01:03',NULL),(3,'Waffles',NULL,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755251931/logt6ifzwrd9kjlsbawk.jpg','2025-08-14 06:04:10','2025-08-15 09:58:52'),(4,'Veg pizza ',NULL,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755180781/n6ldqfg8qgtikiol02ul.jpg','2025-08-14 06:06:42',NULL),(5,'Non veg pizza ',NULL,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755180815/plv1y8c1bbo9jtuckv2i.jpg','2025-08-14 06:10:53',NULL),(6,'Juices',NULL,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755247542/z25pjfp3tle3gxu02ajp.jpg','2025-08-14 06:13:03',NULL),(7,'Mojito ',NULL,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755247986/lqpftfkvdaxhovqxzice.jpg','2025-08-15 08:41:57',NULL),(8,'Pasta',NULL,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755252107/lqkzlmhetfsehncwchrx.jpg','2025-08-15 10:01:39','2025-08-15 10:01:51'),(9,'Maggie',NULL,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755252651/ltapwepazuloddtu17lu.jpg','2025-08-15 10:10:53',NULL),(10,'Burgers',NULL,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755252684/ok5ctafuxjlvq6svki7h.jpg','2025-08-15 10:11:25',NULL),(11,'Pan cakes',NULL,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755252722/ierb1blabkwbpgo8caxk.jpg','2025-08-15 10:12:04',NULL),(12,'French fries',NULL,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755252752/s1jquntvutf4mgdohc0a.jpg','2025-08-15 10:12:34',NULL);
/*!40000 ALTER TABLE `categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `coupons`
--

DROP TABLE IF EXISTS `coupons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coupons` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(30) NOT NULL,
  `description` varchar(120) DEFAULT NULL,
  `type` varchar(50) NOT NULL,
  `discount` decimal(10,2) DEFAULT NULL,
  `min_qty` int DEFAULT NULL,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `buy_qty` int DEFAULT NULL,
  `free_qty` int DEFAULT NULL,
  `subcategory` varchar(255) DEFAULT NULL,
  `product` varchar(255) DEFAULT NULL,
  `category_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `fk_coupon_category` (`category_id`),
  CONSTRAINT `fk_coupon_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `coupons`
--

LOCK TABLES `coupons` WRITE;
/*!40000 ALTER TABLE `coupons` DISABLE KEYS */;
/*!40000 ALTER TABLE `coupons` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customer_orders`
--

DROP TABLE IF EXISTS `customer_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `address_id` int NOT NULL,
  `payment_method` varchar(50) DEFAULT NULL,
  `coupon_code` varchar(50) DEFAULT NULL,
  `total` decimal(10,2) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Placed',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_orders`
--

LOCK TABLES `customer_orders` WRITE;
/*!40000 ALTER TABLE `customer_orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `customer_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `delivery_zones`
--

DROP TABLE IF EXISTS `delivery_zones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `delivery_zones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `latitude` decimal(10,6) NOT NULL,
  `longitude` decimal(10,6) NOT NULL,
  `radius_km` decimal(5,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `delivery_zones`
--

LOCK TABLES `delivery_zones` WRITE;
/*!40000 ALTER TABLE `delivery_zones` DISABLE KEYS */;
INSERT INTO `delivery_zones` VALUES (3,'Alliance University',12.740900,77.695700,8.00,'2025-08-16 06:19:50');
/*!40000 ALTER TABLE `delivery_zones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `expo_tokens`
--

DROP TABLE IF EXISTS `expo_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `expo_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `token` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `expo_tokens`
--

LOCK TABLES `expo_tokens` WRITE;
/*!40000 ALTER TABLE `expo_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `expo_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `favorites`
--

DROP TABLE IF EXISTS `favorites`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `favorites` (
  `user_id` int NOT NULL,
  `menu_item_id` int NOT NULL,
  PRIMARY KEY (`user_id`,`menu_item_id`),
  KEY `menu_item_id` (`menu_item_id`),
  CONSTRAINT `favorites_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `favorites_ibfk_2` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `favorites`
--

LOCK TABLES `favorites` WRITE;
/*!40000 ALTER TABLE `favorites` DISABLE KEYS */;
/*!40000 ALTER TABLE `favorites` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `menu_categories`
--

DROP TABLE IF EXISTS `menu_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(60) NOT NULL,
  `icon` varchar(255) NOT NULL,
  `sort_order` int DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `menu_categories`
--

LOCK TABLES `menu_categories` WRITE;
/*!40000 ALTER TABLE `menu_categories` DISABLE KEYS */;
/*!40000 ALTER TABLE `menu_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `menu_items`
--

DROP TABLE IF EXISTS `menu_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  `description` text,
  `price` decimal(10,2) NOT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `available` tinyint(1) DEFAULT '1',
  `category_id` int DEFAULT NULL,
  `category` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=113 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `menu_items`
--

LOCK TABLES `menu_items` WRITE;
/*!40000 ALTER TABLE `menu_items` DISABLE KEYS */;
INSERT INTO `menu_items` VALUES (13,'CLASSIC REGULAR','Thin crust with tomato and cheesy sauce, baked crisp.',99.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754477772/menu_items/classic%20veg%20pizza.jpg',1,4,NULL),(14,'CLASSIC MEDIUM','Thin crust with tomato and cheesy sauce, baked crisp.',135.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754477772/menu_items/classic%20veg%20pizza.jpg',1,4,NULL),(15,'CLASSIC LARGE','Thin crust with tomato and cheesy sauce, baked crisp.',189.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754477772/menu_items/classic%20veg%20pizza.jpg',1,4,NULL),(16,'ONION/TOMATO REGULAR','Thin crust with tomato, onion, and cheese, baked crisp.',109.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479629/menu_items/oniontomatovegpizza.webp',1,4,NULL),(17,'ONION/TOMATO MEDIUM','Thin crust with tomato, onion, and cheese, baked crisp.',155.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479629/menu_items/oniontomatovegpizza.webp',1,4,NULL),(18,'ONION/TOMATO LARGE','Thin crust with tomato, onion, and cheese, baked crisp.',239.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479629/menu_items/oniontomatovegpizza.webp',1,4,NULL),(19,'GOLDEN CORN REGULAR','Thin crust topped with golden corn and cheese, baked to perfection.',119.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754478861/menu_items/golgencornpizza.webp',1,4,NULL),(20,'GOLDEN CORN MEDIUM','Thin crust topped with golden corn and cheese, baked to perfection.',165.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754478861/menu_items/golgencornpizza.webp',1,4,NULL),(21,'GOLDEN CORN LARGE','Thin crust topped with golden corn and cheese, baked to perfection.',249.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754478861/menu_items/golgencornpizza.webp',1,4,NULL),(22,'PANEER/MUSHROOM REGULAR','Thin crust topped with paneer/mushrooms and cheese, baked to perfection.',149.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753943076/menu_items/mushroom%20pizza.jpg',1,4,NULL),(23,'PANEER/MUSHROOM MEDIUM','Thin crust topped with paneer/mushrooms and cheese, baked to perfection.',185.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753943076/menu_items/mushroom%20pizza.jpg',1,4,NULL),(24,'PANEER/MUSHROOM LARGE','Thin crust topped with paneer/mushrooms and cheese, baked to perfection.',259.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753943076/menu_items/mushroom%20pizza.jpg',1,4,NULL),(25,'PANEER TIKKA REGULAR','Thin crust topped with paneer tikka pieces and cheese, baked to perfection.',169.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479231/menu_items/paneervegpizza.jpg',1,4,NULL),(26,'PANEER TIKKA MEDIUM','Thin crust topped with paneer tikka pieces and cheese, baked to perfection.',215.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479231/menu_items/paneervegpizza.jpg',1,4,NULL),(27,'PANEER TIKKA LARGE','Thin crust topped with paneer tikka pieces and cheese, baked to perfection.',279.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479231/menu_items/paneervegpizza.jpg',1,4,NULL),(28,'VEG LOADED REGULAR','Thin crust loaded with mixed veggies and cheese, baked to perfection.',179.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479128/menu_items/vegloadedpizza.webp',1,4,NULL),(29,'VEG LOADED MEDIUM','Thin crust loaded with mixed veggies and cheese, baked to perfection.',225.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479128/menu_items/vegloadedpizza.webp',1,4,NULL),(30,'VEG LOADED LARGE','Thin crust loaded with mixed veggies and cheese, baked to perfection.',299.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479128/menu_items/vegloadedpizza.webp',1,4,NULL),(31,'CHICKEN REGULAR','Thin crust with tender chicken and melted cheese, oven-baked.',149.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754480410/menu_items/chickennonevegpizza.jpg',1,5,NULL),(32,'CHICKEN MEDIUM','Thin crust with tender chicken and melted cheese, oven-baked.',195.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754480410/menu_items/chickennonevegpizza.jpg',1,5,NULL),(33,'CHICKEN LARGE','Thin crust with tender chicken and melted cheese, oven-baked.',269.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754480410/menu_items/chickennonevegpizza.jpg',1,5,NULL),(34,'CHICKEN SAUSAGE REGULAR','Baked thin crust with chicken sausage and gooey cheese.',159.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479927/menu_items/chickensausagenonevegpizza.webp',1,5,NULL),(35,'CHICKEN SAUSAGE MEDIUM','Baked thin crust with chicken sausage and gooey cheese.',215.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479927/menu_items/chickensausagenonevegpizza.webp',1,5,NULL),(36,'CHICKEN SAUSAGE LARGE','Baked thin crust with chicken sausage and gooey cheese.',279.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479927/menu_items/chickensausagenonevegpizza.webp',1,5,NULL),(37,'PEPPER CHICKEN REGULAR','Thin crust loaded with pepper chicken and gooey cheese, baked golden.',159.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754672720/menu_items/pepperbarbiquechickenpizza.jpg',1,5,NULL),(38,'PEPPER CHICKEN MEDIUM','Thin crust loaded with pepper chicken and gooey cheese, baked golden.',215.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754672720/menu_items/pepperbarbiquechickenpizza.jpg',1,5,NULL),(39,'PEPPER CHICKEN LARGE','Thin crust loaded with pepper chicken and gooey cheese, baked golden.',279.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754672720/menu_items/pepperbarbiquechickenpizza.jpg',1,5,NULL),(40,'CRISPY CHICKEN REGULAR','Crispy chicken chunks with cheese on a thin crust, oven-baked.',169.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754480509/menu_items/crispychickennonvegpizza.webp',1,5,NULL),(41,'CRISPY CHICKEN MEDIUM','Crispy chicken chunks with cheese on a thin crust, oven-baked.',235.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754480509/menu_items/crispychickennonvegpizza.webp',1,5,NULL),(42,'CRISPY CHICKEN LARGE','Crispy chicken chunks with cheese on a thin crust, oven-baked.',319.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754480509/menu_items/crispychickennonvegpizza.webp',1,5,NULL),(43,'PEPPER BBQ/BBQ REGULAR','Crispy base loaded with BBQ chicken/pepper BBQ and melted cheese.',169.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479850/menu_items/pepperchickennonveg.webp',1,5,NULL),(44,'PEPPER BBQ/BBQ MEDIUM','Crispy base loaded with BBQ chicken/pepper BBQ and melted cheese.',235.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479850/menu_items/pepperchickennonveg.webp',1,5,NULL),(45,'PEPPER BBQ/BBQ LARGE','Crispy base loaded with BBQ chicken/pepper BBQ and melted cheese.',319.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754479850/menu_items/pepperchickennonveg.webp',1,5,NULL),(46,'LOADED CHICKEN REGULAR','Thin crust packed with juicy chicken pieces and melted cheese.',199.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754480830/menu_items/loadedchickennonveg.webp',1,5,NULL),(47,'LOADED CHICKEN MEDIUM','Thin crust packed with juicy chicken pieces and melted cheese.',299.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754480830/menu_items/loadedchickennonveg.webp',1,5,NULL),(48,'LOADED CHICKEN LARGE','Thin crust packed with juicy chicken pieces and melted cheese.',389.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754480830/menu_items/loadedchickennonveg.webp',1,5,NULL),(49,'HONEY WAFFLE','Sweet, fluffy waffle drizzled with rich natural honey for a warm, delightful treat.',69.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753945499/menu_items/WAFLE.jpg',1,3,NULL),(50,'DARK CHOCOLATE','A soft waffle loaded with bold dark chocolate, perfect for a deep, satisfying chocolate craving.',109.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753945728/menu_items/dark%20chocolate%20waffle.webp',1,3,NULL),(51,'MILK CHOCOLATE','Soft, warm waffle topped with creamy milk chocolate for a smooth and sweet indulgence.',109.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753945588/menu_items/milk%20chcocolate%20waffle.jpg',1,3,NULL),(52,'WHITE CHOCOLATE','Fluffy waffle topped with rich, velvety white chocolate for a sweet and creamy treat.',109.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753945698/menu_items/WHITE%20CHOCOLATE%20WAFFLE.jpg',1,3,NULL),(53,'OREO CRUNCH','A soft waffle topped with Oreo crumbs and chocolate sauce, giving a perfect cookies & cream flavour burst.',119.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754130988/menu_items/Oreo%20Waffles%20_%20Greedy%20Gourmet.jpg',1,3,NULL),(54,'NUTELLA MUNCHY','Fluffy waffle generously spread with creamy Nutella for a rich, chocolaty hazelnut treat.',119.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753945710/menu_items/nutella%20waffle.jpg',1,3,NULL),(55,'CHOCO OVERLOAD','A warm waffle drenched in layers of dark, milk, and white chocolate for the ultimate chocolate lover?s dream.',119.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753946059/menu_items/chocolate%20waffle%20isolated%20on%20transparent%20background%20%2Cwaffles%20with%20melted%20chocolate%20topping%2C%20generative%20ai.jpg',1,3,NULL),(56,'DOUBLE CHOCOLATE','Soft waffle loaded with chocolate chips and drizzled with rich chocolate sauce for a double chocolate delight.',129.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753945841/menu_items/Double%20Chocolate%20Waffle.jpg',1,3,NULL),(57,'TRIPLE CHOCOLATE','Soft waffle loaded with chocolate chips and drizzled with rich chocolate sauce for a triple chocolate indulgence.',139.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753945876/menu_items/Triple%20Chocolate%20Waffle.jpg',1,3,NULL),(58,'BLUEBERRY WAFFLE','Light, fluffy waffle topped with sweet and tangy blueberries for a refreshing fruity treat.',129.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753945777/menu_items/Blueberry%20Waffle.webp',1,3,NULL),(59,'BANANA SHAKE','Thick and smooth shake blended with fresh bananas for a naturally sweet boost.',59.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753943829/menu_items/banana%20new.jpg',1,1,NULL),(60,'MUSKMELON SHAKE','Sweet and refreshing muskmelon juice served chilled for a light, cooling drink.',69.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754675046/menu_items/muskmelonshake.jpg',1,1,NULL),(61,'OREO SHAKE','Thick, creamy shake loaded with crushed Oreos for a delicious cookies and cream treat.',79.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754131700/menu_items/oreo%20new.jpg',1,1,NULL),(62,'KITKAT SHAKE','Creamy shake with crunchy KitKat for a sweet, chocolatey treat.',89.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754674962/menu_items/kit%20kat%20new.jpg',1,1,NULL),(63,'STRAWBERRY SHAKE','Rich and creamy strawberry shake for a refreshing fruity treat.',89.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753943851/menu_items/strawberry%20new.jpg',1,1,NULL),(64,'VANILLA SHAKE','Creamy and refreshing shake with the timeless flavour of vanilla.',89.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754481581/menu_items/vanillashake.jpg',1,1,NULL),(65,'AVOCADO SHAKE','Thick and silky avocado shake for a healthy and delicious drink.',99.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754481508/menu_items/5a925b2d-315b-4dfc-9be7-e883740e97ab.jpg',1,1,NULL),(66,'CHOCOLATE SHAKE','Thick, smooth shake with a deep, chocolaty flavour for pure indulgence.',99.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753943800/menu_items/chocolate%20shake.webp',1,1,NULL),(67,'LIME MOJITO','Refreshing lime and mint drink with a fizzy twist.',49.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755056237/menu_items/06fdc1a6-8708-46cf-84d5-e426aaa61f09.jpg',1,7,NULL),(68,'ORANGE MOJITO','Fresh orange mojito made with juicy orange pulp, mint leaves, and soda for a pulpy, citrusy refreshment.',59.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754674780/menu_items/ornagemojito.jpg',1,7,NULL),(69,'STRAWBERRY MOJITO','Sweet and tangy strawberry mojito with fresh strawberries, mint leaves, and soda for a fruity, refreshing burst.',79.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754674768/menu_items/strawberrymojito.jpg',1,7,NULL),(70,'LYCHEE MOJITO','Refreshing lychee mojito with juicy lychee pulp, mint leaves, and soda for a sweet, tropical delight.',79.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754674756/menu_items/lycheemojito.jpg',1,7,NULL),(71,'MANGO MOJITO','Sweet and refreshing mango mojito made with ripe mango pulp, mint leaves, and soda for a tropical burst of flavour.',79.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754674744/menu_items/mangomojito.jpg',1,7,NULL),(72,'BLUE CURACAO MOJITO','Cool and vibrant blue curacao mojito with mint leaves and soda for a refreshing citrusy twist.',89.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754674733/menu_items/bluemojito.jpg',1,7,NULL),(73,'MOSAMBI JUICE','Fresh sweet lime juice served chilled for a naturally sweet and refreshing drink.',79.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753944803/menu_items/MOSAMBI%20HUICE.jpg',1,6,NULL),(74,'ORANGE JUICE','Freshly squeezed orange juice served chilled for a sweet, tangy, and revitalising drink.',79.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753944766/menu_items/ORANGE%20JUICE.jpg',1,6,NULL),(75,'WATERMELON JUICE','Refreshing watermelon juice served chilled for a sweet, hydrating, and cooling treat.',79.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753944688/menu_items/WATERMELON%20JUICE.jpg',1,6,NULL),(76,'MUSKMELON JUICE','Sweet and refreshing muskmelon juice served chilled for a light and cooling drink.',89.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753944652/menu_items/MUSKMELLON%20JUICE.jpg',1,6,NULL),(77,'PINEAPPLE JUICE','Tangy and sweet pineapple juice served chilled for a tropical and refreshing drink.',89.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753944614/menu_items/PINEAPPLE%20JUICE.jpg',1,6,NULL),(78,'CHIKOO JUICE','Rich and creamy chikoo (sapota) juice served chilled for a naturally sweet and energising drink.',89.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753944516/menu_items/SAPOTA%20JUICE.jpg',1,6,NULL),(79,'PAPAYA JUICE','Smooth and nutritious papaya juice served chilled for a naturally sweet and healthy refreshment.',89.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753944485/menu_items/PAPAYA%20JUICE.jpg',1,6,NULL),(80,'POMEGRANATE JUICE','Fresh and vibrant pomegranate juice served chilled for a sweet, tangy, and antioxidant-rich drink.',99.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753944409/menu_items/POMEGRANATE%20JUICE.jpg',1,6,NULL),(81,'ABC JUICE','Apple, beetroot, and carrot juice blend for a sweet, healthy boost.',99.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753944365/menu_items/ABC-juice-recipe5.jpg',1,6,NULL),(82,'MANGO JUICE','Refreshing chilled mango juice with a smooth, sweet tropical flavour.',89.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754674252/menu_items/This%20Mango%20Lassi%20recipe%20is%20fruity%20and%20velvety%C3%A2%C2%80%C2%A6.jpg',1,6,NULL),(83,'GRAPE JUICE','Sweet and tangy grape juice served chilled for a refreshing and fruity drink.',89.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754131646/menu_items/Easy%20Grape%20Apple%20Punch%20Juicing%20Recipe%20for%20Detoxing%C3%A2%C2%80%C2%A6.jpg',1,6,NULL),(84,'TANGY TOMATO PASTA (VEG)','Pasta tossed in fresh basil pesto sauce for a rich, aromatic, and flavourful Italian delight.',119.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754675399/menu_items/One-Pot%20Creamy%20Tomato%20Pasta%20Sauce%20-%20MushroomSalus%20%281%29.jpg',1,8,NULL),(85,'TANGY TOMATO PASTA (CHICKEN)','Pasta tossed in fresh basil pesto sauce for a rich, aromatic, and flavourful Italian delight.',139.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754675374/menu_items/b6bab028-d58e-4ca2-abd2-d8fcdaf853c6.jpg',1,8,NULL),(86,'ALFREDA PASTA (VEG)','Creamy white sauce pasta with herbs and cheese.',139.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754489768/menu_items/Creamy%20Vegan%20Alfredo%20Pasta.jpg',1,8,NULL),(87,'ALFREDA PASTA (CHICKEN)','Creamy white sauce pasta with herbs and cheese.',159.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754489768/menu_items/Creamy%20Vegan%20Alfredo%20Pasta.jpg',1,8,NULL),(88,'PLAIN MAGGIE','Simple and tasty Maggi noodles cooked plain for a light and comforting snack.',59.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754489974/menu_items/plain%20maggie.jpg',1,9,NULL),(89,'VEG MAGGIE','Maggi noodles cooked with fresh mixed vegetables for a tasty and wholesome snack.',69.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753944308/menu_items/veg%20maggie.jpg',1,9,NULL),(90,'EGG MAGGIE','Maggi noodles cooked with scrambled eggs for a protein-rich and delicious meal.',79.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754489994/menu_items/EGG%20MAGIE.webp',1,9,NULL),(91,'CHICKEN MAGGIE','Maggi noodles cooked with tender chicken pieces for a hearty and flavourful treat.',99.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754674601/menu_items/chickenmaggir.jpg',1,9,NULL),(92,'CHEESE MAGGIE (VEG)','Maggi noodles mixed with melted cheese for a creamy, cheesy, and comforting snack.',109.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754674713/menu_items/cheesemaggieveg.jpg',1,9,NULL),(93,'CHEESE MAGGIE (NON-VEG)','Maggi noodles mixed with melted cheese for a creamy, cheesy, and comforting snack.',119.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753944282/menu_items/CHEESE%20MAGGIE.jpg',1,9,NULL),(94,'VEG BURGER','Soft bun filled with crispy veg patty, fresh veggies, and creamy sauces.',89.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754488592/menu_items/This%20really%20is%20the%20best%20veggie%20burger%20I%27ve%20ever%C3%A2%C2%80%C2%A6.jpg',1,10,NULL),(95,'PANEER BURGER','Bun filled with crunchy paneer, veggies, and tangy sauces.',109.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754488728/menu_items/Experience%20the%20ultimate%20crunch%21%20This%20burger%C3%A2%C2%80%C2%A6.jpg',1,10,NULL),(96,'CHICKEN BURGER','Soft bun loaded with tender chicken, veggies, and classic spreads.',119.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755146534/menu_items/1000209963.jpg',1,10,NULL),(97,'SALTED FRIES (REGULAR)','Classic fries lightly salted for a crisp and golden snack.',75.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754676215/menu_items/Savory%20Seasoned%20French%20Fries%20Recipe_%20A%20Flavorful%C3%A2%C2%80%C2%A6.jpg',1,12,NULL),(98,'SALTED FRIES (LARGE)','Classic fries lightly salted for a crisp and golden snack.',139.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754490219/menu_items/A%20scrumptious%20image%20of%20a%20freshly%20prepared%20French%C3%A2%C2%80%C2%A6.jpg',1,12,NULL),(99,'PERI PERI FRIES (REGULAR)','Zesty peri peri spiced fries with a tangy twist.',85.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754490287/menu_items/Silly%2C%20Khar.jpg',1,12,NULL),(100,'PERI PERI FRIES (LARGE)','Zesty peri peri spiced fries with a tangy twist.',149.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753945460/menu_items/peri%20peri%20french%20fries.jpg',1,12,NULL),(101,'CHEESY FRIES (REGULAR)','Fries loaded with gooey melted cheese for ultimate indulgence.',95.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754490315/menu_items/8b53fe6e-8625-423c-a590-27b1081aa083.jpg',1,12,NULL),(102,'CHEESY FRIES (LARGE)','Fries loaded with gooey melted cheese for ultimate indulgence.',159.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754490406/menu_items/0b258a08-9f9c-426d-a4ed-09b41d045fe7.jpg',1,12,NULL),(103,'HONEY LADY','Crispy waffle topped with sweet, natural honey.',79.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754676064/menu_items/Miodowaty%20Placki%2C%20or%20Honey%20Pancakes%2C%20are%20a%C3%A2%C2%80%C2%A6.jpg',1,11,NULL),(104,'NAUGHTY NUTELLA','Warm waffle loaded with rich, creamy Nutella.',129.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754676027/menu_items/NAUGHTY%20NUTELLA.jpg',1,11,NULL),(105,'WHITE CHOCOLATE','Soft waffle topped with smooth, melted white chocolate.',119.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754675972/menu_items/Winter%20is%20coming%20so%20whip%20up%20a%20batch%20of%20White%C3%A2%C2%80%C2%A6.jpg',1,11,NULL),(106,'DARK CHOCOLATE','Crisp waffle drizzled with bold, rich dark chocolate.',129.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754675931/menu_items/622f9428-255d-4614-a1c2-859055d6ccb5.jpg',1,11,NULL),(107,'MILK CHOCOLATE','Golden waffle coated with creamy, sweet milk chocolate.',139.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754675887/menu_items/6b23bf3e-1d61-4a95-978e-e3c47cf3f0f0.jpg',1,11,NULL),(108,'DOUBLE CHOCOLATE','Decadent waffle layered with rich dark and smooth milk chocolate.',139.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754675848/menu_items/DOUBLE%20CHOCOLATE%20PANCAKE.jpg',1,11,NULL),(109,'TRIPLE CHOCOLATE','Indulgent waffle loaded with dark, milk, and white chocolate.',149.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754675807/menu_items/TRIPLE%20CHOCOLATE%20PANCAKE.jpg',1,11,NULL),(110,'OREO THUNDER WITH ICE CREAM','Waffle topped with crushed Oreos, ice cream, and chocolate drizzle.',169.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754675729/menu_items/OREO%20THUNDER%20WITH%20ICE%20CREAM.jpg',1,11,NULL),(111,'CRAZY KITKAT WITH ICE CREAM','Waffle loaded with KitKat chunks, ice cream, and chocolate drizzle.',169.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1754675684/menu_items/CRAZY%20KITKAT%20WITH%20ICE%20CREAM%20PANCAKE.jpg',1,11,NULL),(112,'LIME SODA','Classic refreshing drink made with fresh lime juice, soda, and a hint of salt or sugar for a zesty boost.',39.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753944825/menu_items/LIME.jpg',1,6,NULL);
/*!40000 ALTER TABLE `menu_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `messages`
--

DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `chat_id` varchar(100) NOT NULL,
  `sender_id` int NOT NULL,
  `receiver_id` int NOT NULL,
  `text` text NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `sender_id` (`sender_id`),
  KEY `receiver_id` (`receiver_id`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`),
  CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `messages`
--

LOCK TABLES `messages` WRITE;
/*!40000 ALTER TABLE `messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `target` enum('ALL','FIRST_ORDER','VIP') NOT NULL DEFAULT 'ALL',
  `sendAt` datetime NOT NULL,
  `sent` tinyint(1) NOT NULL DEFAULT '0',
  `image` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (16,'DELICUTE','We are offering delicious food items please grab it','ALL','2025-08-13 20:14:00',1,NULL);
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `order_items`
--

DROP TABLE IF EXISTS `order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int DEFAULT NULL,
  `product_id` int DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `qty` int DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `rating` tinyint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_order_items_product_rating` (`product_id`,`rating`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_items`
--

LOCK TABLES `order_items` WRITE;
/*!40000 ALTER TABLE `order_items` DISABLE KEYS */;
INSERT INTO `order_items` VALUES (3,3,NULL,'VEG MAGGIE',1,69.00,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1753944308/menu_items/veg%20maggie.jpg',NULL);
/*!40000 ALTER TABLE `order_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `address` text,
  `total` decimal(10,2) DEFAULT NULL,
  `status` varchar(20) DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `cancel_reason` varchar(255) DEFAULT NULL,
  `payment_method` varchar(50) DEFAULT 'COD',
  `payment_status` varchar(10) DEFAULT NULL,
  `payment_id` int DEFAULT NULL,
  `customer_name` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `rating` tinyint DEFAULT NULL,
  `review` text,
  `delivery_time` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES (3,10,'25',74.00,'Delivered','2025-08-16 15:18:08',NULL,'COD','PAID',NULL,NULL,NULL,'2025-08-16 06:17:09',5,NULL,NULL);
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_resets`
--

DROP TABLE IF EXISTS `password_resets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_resets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `otp` varchar(10) NOT NULL,
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_resets`
--

LOCK TABLES `password_resets` WRITE;
/*!40000 ALTER TABLE `password_resets` DISABLE KEYS */;
INSERT INTO `password_resets` VALUES (1,'svasu18604@gmail.com','505522','2025-07-05 02:17:54');
/*!40000 ALTER TABLE `password_resets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `orderId` int NOT NULL,
  `customerId` int NOT NULL,
  `method` enum('COD','UPI','CARD','WALLET') NOT NULL,
  `gatewayTxnId` varchar(64) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('PENDING','SUCCESS','FAILED','REFUNDED') NOT NULL DEFAULT 'PENDING',
  `paidAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `refundId` varchar(64) DEFAULT NULL,
  `refundAmount` decimal(10,2) DEFAULT NULL,
  `refundAt` datetime DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_paidAt` (`paidAt`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `push_tokens`
--

DROP TABLE IF EXISTS `push_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `push_tokens` (
  `user_id` int NOT NULL,
  `expo_token` varchar(255) DEFAULT NULL,
  `fcm_token` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `push_tokens`
--

LOCK TABLES `push_tokens` WRITE;
/*!40000 ALTER TABLE `push_tokens` DISABLE KEYS */;
INSERT INTO `push_tokens` VALUES (13,'ExponentPushToken[xgc1mSOWy0uPKOqrbLc2tq]',NULL);
/*!40000 ALTER TABLE `push_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reviews`
--

DROP TABLE IF EXISTS `reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `orderId` int NOT NULL,
  `customerId` int NOT NULL,
  `itemId` int DEFAULT NULL,
  `rating` tinyint NOT NULL,
  `comment` text,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `reviews_chk_1` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reviews`
--

LOCK TABLES `reviews` WRITE;
/*!40000 ALTER TABLE `reviews` DISABLE KEYS */;
INSERT INTO `reviews` VALUES (1,101,3,NULL,5,'Loved the pizza!','2025-07-05 19:52:24'),(2,102,4,NULL,2,'Cold on arrival','2025-07-05 19:52:24');
/*!40000 ALTER TABLE `reviews` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `settings`
--

DROP TABLE IF EXISTS `settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `settings` (
  `id` int NOT NULL,
  `app_name` varchar(100) DEFAULT NULL,
  `logo_url` varchar(255) DEFAULT NULL,
  `banner_url` varchar(255) DEFAULT NULL,
  `support_email` varchar(100) DEFAULT NULL,
  `support_phone` varchar(20) DEFAULT NULL,
  `cod_enabled` tinyint(1) DEFAULT NULL,
  `google_login` tinyint(1) DEFAULT NULL,
  `delivery_radius_km` int DEFAULT NULL,
  `tax_percent` float DEFAULT NULL,
  `delivery_fee` float DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `settings`
--

LOCK TABLES `settings` WRITE;
/*!40000 ALTER TABLE `settings` DISABLE KEYS */;
INSERT INTO `settings` VALUES (1,'DELICUTE ',NULL,NULL,'contactdelicute@gmail.com','9652296548',1,1,3,0,5);
/*!40000 ALTER TABLE `settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ticket_status`
--

DROP TABLE IF EXISTS `ticket_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ticket_status` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticketId` int NOT NULL,
  `status` enum('IN_PROGRESS','RESOLVED','CLOSED') NOT NULL,
  `note` text,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ticketId` (`ticketId`),
  CONSTRAINT `ticket_status_ibfk_1` FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ticket_status`
--

LOCK TABLES `ticket_status` WRITE;
/*!40000 ALTER TABLE `ticket_status` DISABLE KEYS */;
/*!40000 ALTER TABLE `ticket_status` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tickets`
--

DROP TABLE IF EXISTS `tickets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tickets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `orderId` int DEFAULT NULL,
  `customerId` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `category` enum('REFUND','COMPLAINT') NOT NULL,
  `status` enum('OPEN','IN_PROGRESS','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tickets`
--

LOCK TABLES `tickets` WRITE;
/*!40000 ALTER TABLE `tickets` DISABLE KEYS */;
/*!40000 ALTER TABLE `tickets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_devices`
--

DROP TABLE IF EXISTS `user_devices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_devices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `device_id` varchar(255) NOT NULL,
  `device_name` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `device_id` (`device_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `user_devices_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_devices`
--

LOCK TABLES `user_devices` WRITE;
/*!40000 ALTER TABLE `user_devices` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_devices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(80) NOT NULL,
  `email` varchar(80) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('customer','admin') DEFAULT 'customer',
  `blocked` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `otp_code` varchar(10) DEFAULT NULL,
  `otp_created_at` datetime DEFAULT NULL,
  `google_id` varchar(255) DEFAULT NULL,
  `avatar_url` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `google_id` (`google_id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (10,'REDDY','svasu18604@gmail.com','9652296548','otp_placeholder','customer',0,'2025-07-21 02:17:27',NULL,NULL,NULL,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755280796/bo1b6c62f82xl6fpvn3g.jpg'),(13,'Delicute Admin','contactdelicute@gmail.com','0000000000','no-password-required','admin',0,'2025-07-21 02:26:33',NULL,NULL,NULL,NULL),(15,'Subbarao','sunkireddysubbarao994@gmail.com','8309492772','otp_placeholder','customer',0,'2025-07-21 04:21:29',NULL,NULL,NULL,'/uploads/avatars/user_15_1753071943194.jpeg'),(16,'Giri','sgiridharreddy040707@gmail.com','6301497335','otp_placeholder','customer',0,'2025-07-21 08:29:47',NULL,NULL,NULL,'/uploads/avatars/user_16_1753086668049.jpeg'),(18,'New User','svasudevareddy18604@gmail.com','8309492775','otp_placeholder','customer',0,'2025-08-14 15:26:22',NULL,NULL,NULL,'https://res.cloudinary.com/do9cbfu5l/image/upload/v1755323927/qfsuxz86s52laev3jbbb.jpg');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `waitlist`
--

DROP TABLE IF EXISTS `waitlist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `waitlist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `latitude` decimal(9,6) NOT NULL,
  `longitude` decimal(9,6) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `waitlist`
--

LOCK TABLES `waitlist` WRITE;
/*!40000 ALTER TABLE `waitlist` DISABLE KEYS */;
INSERT INTO `waitlist` VALUES (1,12.731474,77.704094,'9652296548',NULL,'2025-08-16 06:18:08'),(2,12.731474,77.704094,NULL,NULL,'2025-08-16 06:18:28'),(3,12.731433,77.704056,NULL,NULL,'2025-08-16 09:43:16'),(4,12.731433,77.704056,NULL,NULL,'2025-08-16 09:43:20');
/*!40000 ALTER TABLE `waitlist` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-08-16 16:00:50
