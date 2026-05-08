locals {
  az_count  = length(var.azs)
  nat_count = var.single_nat_gateway ? 1 : local.az_count

  # When single_nat is on, every private subnet shares one route table;
  # otherwise each private subnet routes through its AZ-local NAT and gets
  # its own RT.
  private_rt_count = local.nat_count
}

# --- VPC + IGW ---------------------------------------------------------------

resource "aws_vpc" "this" {
  cidr_block           = var.cidr_block
  enable_dns_support   = true
  enable_dns_hostnames = true # required for RDS endpoint name resolution

  tags = merge(var.tags, {
    Name = "${var.name}-vpc"
  })

  lifecycle {
    precondition {
      condition = (
        length(var.public_subnet_cidrs) == length(var.azs) &&
        length(var.private_subnet_cidrs) == length(var.azs)
      )
      error_message = "public_subnet_cidrs and private_subnet_cidrs must each have one entry per AZ."
    }
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name}-igw"
  })
}

# --- Subnets -----------------------------------------------------------------

resource "aws_subnet" "public" {
  count = local.az_count

  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name = "${var.name}-public-${substr(var.azs[count.index], -1, 1)}"
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  count = local.az_count

  vpc_id            = aws_vpc.this.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.azs[count.index]

  tags = merge(var.tags, {
    Name = "${var.name}-private-${substr(var.azs[count.index], -1, 1)}"
    Tier = "private"
  })
}

# --- NAT (1 if single_nat, else per-AZ) --------------------------------------

resource "aws_eip" "nat" {
  count  = local.nat_count
  domain = "vpc"

  tags = merge(var.tags, {
    Name = "${var.name}-nat-eip-${count.index}"
  })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  count = local.nat_count

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(var.tags, {
    Name = "${var.name}-nat-${count.index}"
  })

  depends_on = [aws_internet_gateway.this]
}

# --- Route tables ------------------------------------------------------------

# One public RT shared by both public subnets — they all route to the IGW.
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name}-public-rt"
  })
}

resource "aws_route" "public_default" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count = local.az_count

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private RTs:
#   single_nat = 1 RT shared by all private subnets, routes via the lone NAT.
#   else       = one RT per AZ, each routing via its AZ-local NAT.
resource "aws_route_table" "private" {
  count = local.private_rt_count

  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name}-private-rt-${count.index}"
  })
}

resource "aws_route" "private_default" {
  count = local.private_rt_count

  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[count.index].id
}

resource "aws_route_table_association" "private" {
  count = local.az_count

  subnet_id = aws_subnet.private[count.index].id
  # If single NAT, point every private subnet at index 0; else map to the
  # AZ-matched RT.
  route_table_id = var.single_nat_gateway ? aws_route_table.private[0].id : aws_route_table.private[count.index].id
}
